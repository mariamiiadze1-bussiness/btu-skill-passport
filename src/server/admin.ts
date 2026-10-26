import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { getAnchorProvider } from "./blockchain/anchoring";
import type { SessionUser } from "./auth/accounts";
import type { Db } from "./db/client";
import {
  anchorPending,
  issueVersions,
  latestOfficialVersions,
  OFFICIAL,
} from "./passport/issuance";
import { issuerAddress, issuerDid } from "./blockchain/issuer";
import { isPrintable } from "./pdf/generate";
import {
  configuredRegistrySource,
  excelSource,
  registrySourceLabel,
  syncFromSource,
} from "./registry";
import {
  activityLog,
  anchorBatches,
  importRecords,
  importRuns,
  passportVersions,
  skillCatalog,
  skills,
  students,
  users,
  verificationChecks,
} from "./db/schema";
import { isSkillCategory, STAMP_CATEGORIES } from "./passport/stamps";
import { isSelfRegistered, PENDING_APPROVAL } from "./passport/students";
import { UserError } from "./core/errors";

export class ForbiddenError extends UserError {
  constructor() {
    super("Administrator access required.");
  }
}

/** Every admin operation starts here; the page redirect is only a convenience. */
export function requireAdmin(user: SessionUser | null): asserts user is SessionUser {
  if (!user || user.role !== "admin") throw new ForbiddenError();
}

const id = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/);
const printable = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(isPrintable, "Use Latin characters only (the passport font cannot print others).");
export const addSkillSchema = z.object({
  // One student (studentId) or several at once (studentIds); both end up in studentIds.
  studentId: id.optional(),
  studentIds: z.array(id).max(500).optional(),
  catalogSkillId: id.optional(),
  name: printable(80).optional(),
  category: z.string().refine(isSkillCategory, "Pick a valid category.").optional(),
  description: printable(300).optional(),
  dateEarned: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date earned."),
  earnedThrough: z.string().trim().max(120).refine(isPrintable).default(""),
});

/** Rows sent for the activity, version and check lists; the dashboard searches and filters them by date. */
const LOG_LIMIT = 300;

export async function getAdminOverview(db: Db, user: SessionUser | null) {
  requireAdmin(user);

  const studentRows = await db
    .select()
    .from(students)
    .orderBy(students.lastName, students.firstName);
  const latest = await latestOfficialVersions(db);
  const catalog = await db
    .select()
    .from(skillCatalog)
    .orderBy(skillCatalog.category, skillCatalog.name);

  const activity = await db
    .select({
      a: activityLog,
      firstName: students.firstName,
      lastName: students.lastName,
      passportId: students.passportId,
    })
    .from(activityLog)
    .leftJoin(students, eq(students.id, activityLog.studentId))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(LOG_LIMIT);

  const runs = await db.select().from(importRuns).orderBy(desc(importRuns.id)).limit(8);
  const failedRecords = await db
    .select()
    .from(importRecords)
    .where(eq(importRecords.status, "failed"))
    .orderBy(desc(importRecords.updatedAt))
    .limit(50);
  const skippedRecords = await db
    .select()
    .from(importRecords)
    .where(eq(importRecords.status, "skipped"))
    .orderBy(desc(importRecords.updatedAt))
    .limit(20);

  const versions = await db
    .select({
      v: passportVersions,
      firstName: students.firstName,
      lastName: students.lastName,
      passportId: students.passportId,
    })
    .from(passportVersions)
    .innerJoin(students, eq(students.id, passportVersions.studentId))
    .orderBy(desc(passportVersions.id))
    .limit(LOG_LIMIT);
  const batches = await db.select().from(anchorBatches).orderBy(desc(anchorBatches.id)).limit(8);
  const [queue] = await db
    .select({ n: count() })
    .from(passportVersions)
    .where(inArray(passportVersions.anchorStatus, ["pending", "submitted"]));
  const checks = await db
    .select()
    .from(verificationChecks)
    .orderBy(desc(verificationChecks.createdAt), desc(verificationChecks.id))
    .limit(LOG_LIMIT);

  let provider: ReturnType<typeof getAnchorProvider> = null;
  let providerError: string | null = null;
  try {
    provider = getAnchorProvider();
  } catch (error) {
    providerError = error instanceof Error ? error.message : String(error);
  }
  const health = provider ? await provider.health() : null;

  return {
    counts: {
      students: studentRows.length,
      passports: latest.size,
      queued: queue?.n ?? 0,
      failedRecords: failedRecords.length,
    },
    registry: {
      source: registrySourceLabel(),
      runs: runs.map((r) => ({
        id: r.id,
        source: r.source,
        status: r.status,
        totals: r.totals,
        error: r.error,
        at: r.startedAt.toISOString(),
      })),
      failed: failedRecords.map((r) => ({
        recordId: r.recordId,
        studentId: r.studentId,
        sheetRow: r.sheetRow,
        message: r.message ?? "",
        at: r.updatedAt.toISOString(),
      })),
      skipped: skippedRecords.map((r) => ({
        recordId: r.recordId,
        studentId: r.studentId,
        message: r.message ?? "",
      })),
    },
    blockchain: {
      enabled: !!provider,
      network: provider?.network ?? null,
      error: providerError,
      issuerAddress: issuerAddress(),
      issuerDid: issuerDid(),
      balance: health?.balance ?? null,
      funded: health?.ok ?? null,
      batches: batches.map((b) => ({
        id: b.id,
        network: b.network,
        status: b.status,
        txHash: b.txHash,
        explorerUrl: provider && b.txHash ? provider.explorerUrl(b.txHash) : null,
        blockNumber: b.blockNumber,
        error: b.error,
        at: b.createdAt.toISOString(),
      })),
    },
    students: studentRows.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      passportId: s.passportId,
      email: s.email,
      version: latest.get(s.id) ?? 0,
      status: s.status,
      pending: s.status === PENDING_APPROVAL,
      signedUpAt: s.createdAt.toISOString(),
    })),
    catalog: catalog.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      description: c.description,
    })),
    categories: Object.keys(STAMP_CATEGORIES),
    activity: activity.map(({ a, firstName, lastName, passportId }) => ({
      id: a.id,
      student: firstName ? `${firstName} ${lastName}` : "System",
      passportId: passportId ?? "",
      action: a.action,
      version: a.version,
      status: a.status,
      at: a.createdAt.toISOString(),
    })),
    versions: versions.map(({ v, firstName, lastName, passportId }) => ({
      id: v.id,
      student: `${firstName} ${lastName}`,
      passportId,
      version: v.version,
      issuedAt: v.issuedOn,
      code: v.verificationCode,
      skillCount: v.skillIds.length,
      status: v.anchorStatus,
      isCurrent:
        (OFFICIAL as readonly string[]).includes(v.anchorStatus) &&
        latest.get(v.studentId) === v.version,
    })),
    checks: checks.map((c) => ({
      id: c.id,
      code: c.codeMasked,
      result: c.result,
      at: c.createdAt.toISOString(),
    })),
  };
}

/** Pull new verified records from the live registry (Google Sheets or the Excel file). */
export async function syncRegistry(db: Db, user: SessionUser | null) {
  requireAdmin(user);
  const source = configuredRegistrySource();
  if (!source)
    throw new UserError(
      "No live registry is configured. Set REGISTRY_EXCEL_PATH or the GOOGLE_SHEETS_* variables, or upload an Excel file instead.",
    );
  return summarize(await syncFromSource(db, source, user.id));
}

/** Same pipeline, from an uploaded .xlsx in BTU's workbook format. */
export async function importExcel(db: Db, user: SessionUser | null, file: File | null) {
  requireAdmin(user);
  if (!file || file.size === 0) throw new UserError("Choose an .xlsx file to import.");
  if (file.size > 5 * 1024 * 1024) throw new UserError("The file is larger than 5 MB.");
  if (!/\.xlsx$/i.test(file.name)) throw new UserError("Only .xlsx files are supported.");
  return summarize(await syncFromSource(db, excelSource(await file.arrayBuffer()), user.id));
}

function summarize(result: Awaited<ReturnType<typeof syncFromSource>>) {
  return {
    totals: result.totals,
    anchorError: result.anchorError,
    writeBackError: result.writeBackError,
    problems: result.outcomes
      .filter((o) => o.status === "failed" || o.status === "skipped")
      .slice(0, 50),
  };
}

/** Confirms a student who signed up themselves: they become a BTU student skills can be added to. */
export async function approveStudent(db: Db, user: SessionUser | null, studentId: unknown) {
  requireAdmin(user);
  const id = z.string().max(40).parse(studentId);
  const [approved] = await db
    .update(students)
    .set({ status: "Active" })
    .where(and(eq(students.id, id), eq(students.status, PENDING_APPROVAL)))
    .returning({ id: students.id });
  if (!approved) throw new UserError("That student is not waiting for approval.");
  await db.insert(activityLog).values({
    studentId: id,
    actorUserId: user.id,
    action: "Student approved",
    status: "completed",
  });
  return { approved: id };
}

/** Removes a self sign-up that is not a BTU student: their account and reserved passport. */
export async function rejectStudent(db: Db, user: SessionUser | null, studentId: unknown) {
  requireAdmin(user);
  const id = z.string().max(40).parse(studentId);
  const [student] = await db.select().from(students).where(eq(students.id, id));
  if (!student || student.status !== PENDING_APPROVAL || !isSelfRegistered(id))
    throw new UserError("That student is not waiting for approval.");
  await db.delete(users).where(eq(users.studentId, id));
  await db.delete(students).where(eq(students.id, id));
  return { rejected: id };
}

/** BTU staff add an award by hand (e.g. a one-off activity) to one or many students; passports update at once. */
export async function addSkill(db: Db, user: SessionUser | null, input: unknown) {
  requireAdmin(user);
  const data = addSkillSchema.parse(input);
  const ids = [
    ...new Set([...(data.studentIds ?? []), ...(data.studentId ? [data.studentId] : [])]),
  ];
  if (!ids.length) throw new UserError("Choose at least one student.");
  const found = await db.select().from(students).where(inArray(students.id, ids));
  if (found.length !== ids.length) throw new UserError("Student not found.");
  const waiting = found.filter((s) => s.status === PENDING_APPROVAL);
  if (waiting.length)
    throw new UserError(
      `Approve ${ids.length === 1 ? "this student" : waiting.map((s) => `${s.firstName} ${s.lastName}`).join(", ")} first (Waiting for approval, above).`,
    );

  let catalog = data.catalogSkillId
    ? (await db.select().from(skillCatalog).where(eq(skillCatalog.id, data.catalogSkillId)))[0]
    : undefined;
  if (data.catalogSkillId && !catalog) throw new UserError("That skill is not in the catalog.");
  if (!catalog) {
    if (!data.name || !data.category || !data.description)
      throw new UserError("Pick a catalog skill, or enter a name, category and description.");
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(skillCatalog);
    [catalog] = await db
      .insert(skillCatalog)
      .values({
        id: `SKL-${String(n + 101).padStart(3, "0")}`,
        name: data.name,
        category: data.category,
        badgeCode: STAMP_CATEGORIES[data.category as keyof typeof STAMP_CATEGORIES].badgeCode,
        description: data.description,
      })
      .returning();
  }
  const skill = catalog!;
  const holders = new Set(
    (
      await db
        .select({ studentId: skills.studentId })
        .from(skills)
        .where(
          and(
            inArray(skills.studentId, ids),
            eq(skills.catalogSkillId, skill.id),
            ne(skills.status, "rejected"),
          ),
        )
    ).map((r) => r.studentId),
  );
  const targets = found.filter((s) => !holders.has(s.id));
  if (!targets.length)
    throw new UserError(
      `${skill.name} is already on ${ids.length === 1 ? "this passport" : "every selected passport"}.`,
    );

  const stamp = Date.now().toString(36).toUpperCase();
  await db.insert(skills).values(
    targets.map((student, i) => ({
      id: targets.length === 1 ? `REC-M${stamp}` : `REC-M${stamp}-${i + 1}`,
      studentId: student.id,
      catalogSkillId: skill.id,
      name: skill.name,
      category: skill.category,
      badgeCode: skill.badgeCode,
      description: skill.description,
      dateEarned: data.dateEarned,
      earnedThrough: data.earnedThrough,
      source: "admin",
      status: "approved" as const,
      reviewedBy: user.id,
      reviewedAt: new Date(),
    })),
  );
  await db.insert(activityLog).values(
    targets.map((student) => ({
      studentId: student.id,
      actorUserId: user.id,
      action: `Skill added: ${skill.name}`,
      status: "completed" as const,
    })),
  );
  // All passports go into one Merkle batch, so one blockchain transaction covers the whole group.
  const issued = await issueVersions(
    db,
    targets.map((s) => s.id),
  );
  const anchor = await anchorPending(db);
  return {
    version: issued[0]?.version ?? null,
    issued: issued.length,
    skipped: found.filter((s) => holders.has(s.id)).map((s) => `${s.firstName} ${s.lastName}`),
    anchorError: anchor.error,
  };
}

/** Retry queue: anchors anything still pending and finishes submitted transactions. */
export async function retryAnchoring(db: Db, user: SessionUser | null) {
  requireAdmin(user);
  return anchorPending(db);
}
