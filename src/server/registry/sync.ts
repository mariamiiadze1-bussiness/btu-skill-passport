import { and, eq, inArray } from "drizzle-orm";

import type { Db } from "../db/client";
import { anchorPending, issueVersions, OFFICIAL, withLock } from "../passport/issuance";
import {
  activityLog,
  importRecords,
  importRuns,
  passportVersions,
  skillCatalog,
  skills,
  students,
} from "../db/schema";
import { isSelfRegistered, nextPassportId, sameName } from "../passport/students";
import {
  parseWorkbook,
  rowHash,
  type ParsedRow,
  type RegistryRow,
  type RegistryStudent,
  type SheetTable,
  type Workbook,
} from "./format";
import { UserError } from "../core/errors";

/**
 * Registry → passports. Implements the hackathon spec §2 and §4:
 *   read rows → validate → find the student by Student ID → skip Record IDs already processed
 *   → skip skills already on the passport → add the award → issue ONE new version per affected
 *   student → anchor on the blockchain → report a status for every row (written back to the sheet).
 * Re-running with the same data changes nothing (idempotent by Record ID).
 */

export type RowOutcome = {
  tab: string;
  sheetRow: number;
  recordId: string;
  studentId: string;
  /** synced: on an issued passport · pending: issued, waiting for blockchain · skipped · failed */
  status: "synced" | "pending" | "already_synced" | "skipped" | "failed";
  message: string;
  version?: number | undefined;
  passportId?: string | undefined;
  /** What the sheet's sync-status column said before this run. */
  sheetStatus?: string | undefined;
};

export type SyncResult = {
  runId: number;
  totals: {
    rows: number;
    synced: number;
    alreadySynced: number;
    skipped: number;
    failed: number;
    versions: number;
  };
  outcomes: RowOutcome[];
  /** Permanent Passport ID of every student in the sheet, to write back to all their rows. */
  passportIds: Record<string, string>;
  anchorError: string | null;
};

export type SyncOptions = {
  source: string;
  actorUserId?: string | null | undefined;
  now?: Date;
  /** Seed only: import just these rows (e.g. the workbook's already-SYNCED baseline). */
  filter?: (row: RegistryRow) => boolean;
  /** Seed only: still register the students of rows the filter leaves out. */
  ensurePassports?: boolean;
};

class RowError extends Error {}

export async function runSync(
  db: Db,
  input: Workbook | SheetTable,
  options: SyncOptions,
): Promise<SyncResult> {
  const result = await withLock(db, "registry-sync", 600, () => syncLocked(db, input, options));
  if (!result) throw new UserError("Another sync is already running. Try again in a minute.");
  return result;
}

async function syncLocked(
  db: Db,
  input: Workbook | SheetTable,
  options: SyncOptions,
): Promise<SyncResult> {
  const now = options.now ?? new Date();
  let parsed;
  try {
    parsed = parseWorkbook(input);
  } catch (error) {
    throw new UserError(error instanceof Error ? error.message : String(error));
  }
  const [run] = await db
    .insert(importRuns)
    .values({ source: options.source, actorUserId: options.actorUserId ?? null, status: "running" })
    .returning();
  const outcomes: RowOutcome[] = [];
  /** Students whose passport content changed in this run. */
  const affected = new Set<string>();
  /** Students confirmed by BTU's data in this run (they must have a passport). */
  const touched = new Set<string>();
  const seen = new Set<string>();

  try {
    // Registries layout: every student in the Students tab gets a passport (spec stage 1–3).
    for (const entry of parsed.students) {
      if (!entry.student) {
        outcomes.push({
          tab: entry.tab,
          sheetRow: entry.sheetRow,
          recordId: "",
          studentId: entry.studentId,
          status: "failed",
          message: entry.errors.join("; "),
        });
        continue;
      }
      try {
        touched.add((await resolveStudent(db, entry.student, now)).id);
      } catch (error) {
        if (!(error instanceof RowError)) throw error;
        outcomes.push({
          tab: entry.tab,
          sheetRow: entry.sheetRow,
          recordId: "",
          studentId: entry.studentId,
          status: "failed",
          message: error.message,
        });
      }
    }

    for (const entry of parsed.rows) {
      if (!entry.ok) {
        outcomes.push({
          tab: entry.tab,
          sheetRow: entry.sheetRow,
          recordId: entry.recordId,
          studentId: entry.studentId,
          status: "failed",
          message: entry.errors.join("; "),
        });
        continue;
      }
      const row = entry.row;
      if (options.filter && !options.filter(row)) {
        if (options.ensurePassports) {
          const student = await resolveStudent(db, row, now).catch(() => null);
          if (student) touched.add(student.id);
        }
        continue;
      }
      if (seen.has(row.recordId)) {
        outcomes.push(
          outcome(row, "failed", `Record ID ${row.recordId} appears more than once in the sheet`),
        );
        continue;
      }
      seen.add(row.recordId);
      try {
        outcomes.push(await processRow(db, row, now, options.source, affected, touched));
      } catch (error) {
        if (!(error instanceof RowError)) throw error;
        outcomes.push(outcome(row, "failed", error.message));
      }
    }

    // A confirmed student without any passport yet gets version 1 (possibly with no skills).
    if (touched.size) {
      const withVersion = new Set(
        (
          await db
            .selectDistinct({ id: passportVersions.studentId })
            .from(passportVersions)
            .where(inArray(passportVersions.studentId, [...touched]))
        ).map((r) => r.id),
      );
      for (const id of touched) if (!withVersion.has(id)) affected.add(id);
    }

    // One new version per affected student, then a single blockchain batch for all of them.
    const issued = await issueVersions(db, [...affected], now);
    const versionByStudent = new Map(issued.map((v) => [v.studentId, v.version]));
    const anchor = await anchorPending(db);

    const studentIds = [
      ...new Set(
        [
          ...outcomes.map((o) => o.studentId),
          ...parsed.rows.map((r) => (r.ok ? r.row.studentId : r.studentId)),
          ...parsed.students.map((x) => x.studentId),
        ].filter(Boolean),
      ),
    ];
    const official = await officialVersionSet(db, studentIds);
    for (const o of outcomes) {
      if (o.status === "synced") o.version = versionByStudent.get(o.studentId);
      if (
        (o.status === "synced" || o.status === "already_synced") &&
        o.version &&
        !official.has(`${o.studentId}:${o.version}`)
      ) {
        o.status = "pending";
        o.message = `Issued in v${o.version}; waiting for blockchain confirmation`;
      }
    }
    await recordOutcomes(db, run!.id, outcomes, parsed.rows);
    const passportIds = studentIds.length
      ? Object.fromEntries(
          (
            await db
              .select({ id: students.id, passportId: students.passportId })
              .from(students)
              .where(inArray(students.id, studentIds))
          ).map((s) => [s.id, s.passportId]),
        )
      : {};

    const totals = {
      rows: outcomes.length,
      synced: outcomes.filter((o) => o.status === "synced" || o.status === "pending").length,
      alreadySynced: outcomes.filter((o) => o.status === "already_synced").length,
      skipped: outcomes.filter((o) => o.status === "skipped").length,
      failed: outcomes.filter((o) => o.status === "failed").length,
      versions: issued.length,
    };
    await db
      .update(importRuns)
      .set({ status: "completed", totals, finishedAt: new Date() })
      .where(eq(importRuns.id, run!.id));
    if (issued.length || totals.failed) {
      await db.insert(activityLog).values({
        actorUserId: options.actorUserId ?? null,
        action: `Registry sync (${options.source}): ${totals.synced} new, ${totals.failed} failed, ${issued.length} passports updated`,
        status: totals.failed ? "failed" : "completed",
      });
    }
    return { runId: run!.id, totals, outcomes, passportIds, anchorError: anchor.error };
  } catch (error) {
    await db
      .update(importRuns)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      })
      .where(eq(importRuns.id, run!.id));
    throw error;
  }
}

const outcome = (
  row: RegistryRow,
  status: RowOutcome["status"],
  message: string,
  extra: Partial<RowOutcome> = {},
): RowOutcome => ({
  tab: row.tab,
  sheetRow: row.sheetRow,
  recordId: row.recordId,
  studentId: row.studentId,
  status,
  message,
  sheetStatus: row.syncStatus,
  ...extra,
});

async function processRow(
  db: Db,
  row: RegistryRow,
  now: Date,
  source: string,
  affected: Set<string>,
  touched: Set<string>,
): Promise<RowOutcome> {
  // Only confirmed awards reach the official document (spec: PENDING/REJECTED never do).
  if (row.verificationStatus && row.verificationStatus !== "CONFIRMED") {
    return outcome(row, "skipped", `Not added: award status is ${row.verificationStatus}`);
  }

  // A Record ID is processed exactly once; an edited, already-issued record is refused.
  const [ledger] = await db
    .select()
    .from(importRecords)
    .where(eq(importRecords.recordId, row.recordId));
  const [existingAward] = await db.select().from(skills).where(eq(skills.id, row.recordId));
  if (existingAward) {
    if (existingAward.studentId !== row.studentId && !isSelfRegistered(existingAward.studentId)) {
      throw new RowError(`Record ID ${row.recordId} already belongs to another student`);
    }
    if (ledger?.rowHash && ledger.rowHash !== rowHash(row)) {
      throw new RowError(
        `Record ${row.recordId} was changed after it was issued; add a new Record ID instead`,
      );
    }
    const version = ledger?.version ?? undefined;
    const [student] = await db
      .select({ passportId: students.passportId })
      .from(students)
      .where(eq(students.id, row.studentId));
    return outcome(row, "already_synced", "Already on the passport", {
      version,
      passportId: student?.passportId,
    });
  }

  return db
    .transaction(async (tx) => {
      const student = await resolveStudent(tx as unknown as Db, row, now);

      // Skills Catalog: the Skill ID must always mean the same skill.
      const [catalog] = await tx
        .select()
        .from(skillCatalog)
        .where(eq(skillCatalog.id, row.skillId));
      if (catalog && (catalog.name !== row.skillName || catalog.category !== row.category)) {
        throw new RowError(
          `Skill ID ${row.skillId} is "${catalog.name}" (${catalog.category}) in the catalog, not "${row.skillName}" (${row.category})`,
        );
      }
      if (!catalog) {
        await tx.insert(skillCatalog).values({
          id: row.skillId,
          name: row.skillName,
          category: row.category,
          badgeCode: row.badgeCode,
          description: row.description,
        });
      }

      // The same skill is never printed twice on one passport.
      const [duplicate] = await tx
        .select({ id: skills.id })
        .from(skills)
        .where(
          and(
            eq(skills.studentId, student.id),
            eq(skills.catalogSkillId, row.skillId),
            eq(skills.status, "approved"),
          ),
        );
      if (duplicate)
        return outcome(
          row,
          "skipped",
          `Duplicate: ${row.skillName} is already on the passport (${duplicate.id})`,
          { passportId: student.passportId },
        );

      await tx.insert(skills).values({
        id: row.recordId,
        studentId: student.id,
        catalogSkillId: row.skillId,
        name: row.skillName,
        category: row.category,
        badgeCode: row.badgeCode,
        description: row.description,
        dateEarned: row.dateEarned,
        earnedThrough: row.earnedThrough,
        source,
        status: "approved",
      });
      affected.add(student.id);
      return outcome(row, "synced", "Added to the passport", { passportId: student.passportId });
    })
    .then((result) => {
      // Only after the transaction committed: the student now certainly exists.
      touched.add(row.studentId);
      return result;
    })
    .catch((error: unknown) => {
      if (error instanceof RowError) throw error;
      throw new RowError(
        `Could not process this record: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
    });
}

/**
 * Finds the student by Student ID (spec §4.3). A self-registered student is claimed by email
 * the first time the registry lists them. Name or Passport ID mismatches stop the row, so a
 * wrong ID can never update someone else's passport.
 */
async function resolveStudent(db: Db, row: RegistryStudent, now: Date) {
  const [byId] = await db.select().from(students).where(eq(students.id, row.studentId));
  if (byId) {
    if (!sameName(byId.firstName, row.firstName) || !sameName(byId.lastName, row.lastName)) {
      throw new RowError(
        `Name "${row.firstName} ${row.lastName}" does not match Student ID ${row.studentId} in the registry`,
      );
    }
    if (row.passportId && row.passportId !== byId.passportId) {
      throw new RowError(
        `Passport ID ${row.passportId} does not match ${row.studentId}'s passport (${byId.passportId})`,
      );
    }
    return byId;
  }

  const [byEmail] = await db.select().from(students).where(eq(students.email, row.email));
  if (byEmail) {
    if (!isSelfRegistered(byEmail.id))
      throw new RowError(`Email ${row.email} already belongs to Student ID ${byEmail.id}`);
    if (!sameName(byEmail.firstName, row.firstName) || !sameName(byEmail.lastName, row.lastName)) {
      throw new RowError(`Name does not match the account registered with ${row.email}`);
    }
    if (row.passportId && row.passportId !== byEmail.passportId) {
      throw new RowError(
        `Passport ID ${row.passportId} does not match the passport issued at registration (${byEmail.passportId})`,
      );
    }
    const [claimed] = await db
      .update(students)
      .set({
        id: row.studentId,
        program: row.program || byEmail.program,
        educationLevel: row.educationLevel || byEmail.educationLevel,
        status: row.studentStatus,
        ...(row.firstIssued ? { issuedAt: row.firstIssued } : {}),
      })
      .where(eq(students.id, byEmail.id))
      .returning();
    return claimed!;
  }

  if (row.passportId) {
    const [taken] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.passportId, row.passportId));
    if (taken) throw new RowError(`Passport ID ${row.passportId} already belongs to ${taken.id}`);
  }
  const [created] = await db
    .insert(students)
    .values({
      id: row.studentId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      program: row.program,
      educationLevel: row.educationLevel,
      passportId: row.passportId || (await nextPassportId(db)),
      issuedAt: row.firstIssued || now.toISOString().slice(0, 10),
      status: row.studentStatus,
    })
    .returning();
  return created!;
}

async function officialVersionSet(db: Db, studentIds: string[]) {
  if (!studentIds.length) return new Set<string>();
  const rows = await db
    .select({ s: passportVersions.studentId, v: passportVersions.version })
    .from(passportVersions)
    .where(
      and(
        inArray(passportVersions.studentId, studentIds),
        inArray(passportVersions.anchorStatus, [...OFFICIAL]),
      ),
    );
  return new Set(rows.map((r) => `${r.s}:${r.v}`));
}

async function recordOutcomes(db: Db, runId: number, outcomes: RowOutcome[], rows: ParsedRow[]) {
  const hashByRecord = new Map(
    rows.filter((r) => r.ok).map((r) => [r.row.recordId, rowHash(r.row)]),
  );
  for (const o of outcomes) {
    if (!o.recordId || o.status === "already_synced") continue;
    const [existing] = await db
      .select({ status: importRecords.status })
      .from(importRecords)
      .where(eq(importRecords.recordId, o.recordId));
    // Never let a later bad copy of a row overwrite the ledger entry of an issued record.
    if (existing?.status === "synced" && o.status === "failed") continue;
    const values = {
      recordId: o.recordId,
      runId,
      studentId: o.studentId,
      sheetRow: o.sheetRow,
      status: (o.status === "pending" ? "synced" : o.status) as "synced" | "skipped" | "failed",
      version: o.version ?? null,
      message: o.message,
      rowHash:
        o.status === "synced" || o.status === "pending"
          ? (hashByRecord.get(o.recordId) ?? null)
          : null,
      updatedAt: new Date(),
    };
    await db
      .insert(importRecords)
      .values(values)
      .onConflictDoUpdate({ target: importRecords.recordId, set: values });
  }
}
