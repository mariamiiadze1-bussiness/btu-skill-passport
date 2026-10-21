import { and, asc, eq, inArray, lt, max, sql } from "drizzle-orm";

import { getAnchorProvider } from "./anchoring";
import { appUrl } from "./config";
import { newVerificationCode, sha256Bytes } from "./crypto";
import type { Db } from "./db";
import { signLeaf } from "./issuer";
import { buildMerkleTree, versionLeaf } from "./merkle";
import { notifyIssued } from "./notifications";
import { generatePassportPdf } from "./pdf/generate";
import { activityLog, anchorBatches, locks, passportVersions, skills, students } from "./schema";

/** Statuses that make a version an officially issued document. */
export const OFFICIAL = ["anchored", "unanchored"] as const;

const today = (now: Date) => now.toISOString().slice(0, 10);

type StudentRow = typeof students.$inferSelect;
type SkillRow = typeof skills.$inferSelect;

/** The exact input that produced (and reproduces) a version's PDF. */
export function pdfInput(
  student: Pick<StudentRow, "firstName" | "lastName" | "passportId">,
  version: { issuedOn: string; verificationCode: string; verifyUrl: string },
  skillRows: SkillRow[],
) {
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    passportId: student.passportId,
    issuedOn: version.issuedOn,
    verificationCode: version.verificationCode,
    verifyUrl: version.verifyUrl,
    skills: skillRows.map((s) => ({
      name: s.name,
      category: s.category,
      description: s.description,
      dateEarned: s.dateEarned,
      earnedThrough: s.earnedThrough,
    })),
  };
}

export async function orderedSkills(db: Db, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select().from(skills).where(inArray(skills.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is SkillRow => !!r);
}

/**
 * Creates the next version for each student: snapshot of all approved skills → PDF →
 * SHA-256 → Merkle leaf → BTU signature. Versions start "pending" and only become the
 * latest official version once anchorPending() has recorded them on the blockchain.
 */
export async function issueVersions(db: Db, studentIds: string[], now = new Date()) {
  const issued: { studentId: string; version: number; id: number }[] = [];
  for (const studentId of [...new Set(studentIds)]) {
    const row = await db.transaction(async (tx) => {
      // Serialize issuance per student so two runs can't claim the same version number.
      await tx.execute(sql`select id from students where id = ${studentId} for update`);
      const [student] = await tx.select().from(students).where(eq(students.id, studentId));
      if (!student) throw new Error(`Student ${studentId} not found.`);
      const approved = await tx
        .select()
        .from(skills)
        .where(and(eq(skills.studentId, studentId), eq(skills.status, "approved")))
        .orderBy(asc(skills.dateEarned), asc(skills.id));
      const [{ latest } = { latest: null }] = await tx
        .select({ latest: max(passportVersions.version) })
        .from(passportVersions)
        .where(eq(passportVersions.studentId, studentId));
      const version = (latest ?? 0) + 1;
      const verificationCode = newVerificationCode();
      // Version 1 carries the passport's fixed first-issue date; later versions the update date.
      const issuedOn = version === 1 ? student.issuedAt : today(now);
      const meta = {
        issuedOn,
        verificationCode,
        verifyUrl: `${appUrl()}/verify?code=${verificationCode}`,
      };
      const pdf = await generatePassportPdf(pdfInput(student, meta, approved));
      const pdfSha256 = sha256Bytes(pdf);
      const merkleLeaf = versionLeaf({
        passportId: student.passportId,
        version,
        verificationCode,
        pdfSha256,
      });
      const [created] = await tx
        .insert(passportVersions)
        .values({
          studentId,
          version,
          issuedAt: now,
          ...meta,
          skillIds: approved.map((s) => s.id),
          pdfSha256,
          merkleLeaf,
          issuerSignature: await signLeaf(merkleLeaf),
          anchorStatus: "pending",
        })
        .returning({ id: passportVersions.id });
      return { studentId, version, id: created!.id };
    });
    issued.push(row);
  }
  return issued;
}

async function withLock<T>(
  db: Db,
  name: string,
  ttlSeconds: number,
  run: () => Promise<T>,
): Promise<T | null> {
  await db.delete(locks).where(and(eq(locks.name, name), lt(locks.expiresAt, new Date())));
  const [got] = await db
    .insert(locks)
    .values({ name, expiresAt: new Date(Date.now() + ttlSeconds * 1000) })
    .onConflictDoNothing()
    .returning();
  if (!got) return null;
  try {
    return await run();
  } finally {
    await db.delete(locks).where(eq(locks.name, name));
  }
}

export { withLock };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Marks a confirmed batch's versions as officially issued. */
async function finalizeBatch(db: Db, batchId: number, blockNumber: number) {
  await db
    .update(anchorBatches)
    .set({ status: "confirmed", blockNumber, confirmedAt: new Date() })
    .where(eq(anchorBatches.id, batchId));
  const done = await db
    .update(passportVersions)
    .set({ anchorStatus: "anchored" })
    .where(eq(passportVersions.anchorBatchId, batchId))
    .returning({ studentId: passportVersions.studentId, version: passportVersions.version });
  if (done.length) {
    await db.insert(activityLog).values(
      done.map((v) => ({
        studentId: v.studentId,
        action: `Passport v${v.version} issued and anchored`,
        version: v.version,
        status: "completed" as const,
      })),
    );
    await notifyIssued(db, done);
  }
}

/**
 * Anchors every pending version in one transaction (Merkle root), then waits for
 * confirmation. Safe to call repeatedly: it also finishes batches submitted earlier, and
 * failed submissions leave versions pending for the next retry (cron or admin button).
 */
export async function anchorPending(db: Db, { waitMs = 90_000, pollMs = 4_000 } = {}) {
  const provider = getAnchorProvider();
  if (!provider) {
    const done = await db
      .update(passportVersions)
      .set({ anchorStatus: "unanchored" })
      .where(eq(passportVersions.anchorStatus, "pending"))
      .returning({ studentId: passportVersions.studentId, version: passportVersions.version });
    if (done.length) {
      await db.insert(activityLog).values(
        done.map((v) => ({
          studentId: v.studentId,
          action: `Passport v${v.version} issued (no blockchain configured)`,
          version: v.version,
          status: "completed" as const,
        })),
      );
      await notifyIssued(db, done);
    }
    return {
      anchored: 0,
      unanchored: done.length,
      batchId: null as number | null,
      error: null as string | null,
    };
  }

  const result = await withLock(db, "anchor", 300, async () => {
    // 1. Finish batches submitted by earlier runs.
    for (const batch of await db
      .select()
      .from(anchorBatches)
      .where(eq(anchorBatches.status, "submitted"))) {
      const state = await provider.status(batch.txHash!);
      if (state.state === "confirmed") await finalizeBatch(db, batch.id, state.blockNumber);
      if (state.state === "failed") await failBatch(db, batch.id, state.error);
    }

    // 2. Anchor what is still pending.
    const pending = await db
      .select({ id: passportVersions.id, leaf: passportVersions.merkleLeaf })
      .from(passportVersions)
      .where(eq(passportVersions.anchorStatus, "pending"))
      .orderBy(asc(passportVersions.id))
      .limit(10_000);
    if (!pending.length) return { anchored: 0, unanchored: 0, batchId: null, error: null };

    const tree = buildMerkleTree(pending.map((p) => p.leaf));
    const [batch] = await db
      .insert(anchorBatches)
      .values({
        provider: provider.id,
        network: provider.network,
        merkleRoot: tree.root,
        status: "submitted",
      })
      .returning();
    let txHash: string;
    try {
      ({ txHash } = await provider.submit(tree.root));
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0]! : String(error);
      await db
        .update(anchorBatches)
        .set({ status: "failed", error: message })
        .where(eq(anchorBatches.id, batch!.id));
      return { anchored: 0, unanchored: 0, batchId: batch!.id, error: message };
    }
    await db.update(anchorBatches).set({ txHash }).where(eq(anchorBatches.id, batch!.id));
    for (const [i, p] of pending.entries()) {
      await db
        .update(passportVersions)
        .set({ anchorStatus: "submitted", anchorBatchId: batch!.id, merkleProof: tree.proof(i) })
        .where(eq(passportVersions.id, p.id));
    }

    // 3. Wait for the block (a later call finishes it if this one times out).
    const deadline = Date.now() + waitMs;
    for (let first = true; first || Date.now() < deadline; first = false) {
      if (!first) await sleep(pollMs);
      const state = await provider.status(txHash);
      if (state.state === "confirmed") {
        await finalizeBatch(db, batch!.id, state.blockNumber);
        return { anchored: pending.length, unanchored: 0, batchId: batch!.id, error: null };
      }
      if (state.state === "failed") {
        await failBatch(db, batch!.id, state.error);
        return { anchored: 0, unanchored: 0, batchId: batch!.id, error: state.error };
      }
    }
    return {
      anchored: 0,
      unanchored: 0,
      batchId: batch!.id,
      error: "Waiting for confirmation; it will be finalized on the next run.",
    };
  });
  return (
    result ?? {
      anchored: 0,
      unanchored: 0,
      batchId: null,
      error: "Another anchoring run is in progress.",
    }
  );
}

/** A failed transaction sends its versions back to the queue. */
async function failBatch(db: Db, batchId: number, error: string) {
  await db
    .update(anchorBatches)
    .set({ status: "failed", error })
    .where(eq(anchorBatches.id, batchId));
  await db
    .update(passportVersions)
    .set({ anchorStatus: "pending", anchorBatchId: null, merkleProof: null })
    .where(eq(passportVersions.anchorBatchId, batchId));
}

/** The latest officially issued version number per student. */
export async function latestOfficialVersions(db: Db, studentIds?: string[]) {
  const rows = await db
    .select({ studentId: passportVersions.studentId, version: max(passportVersions.version) })
    .from(passportVersions)
    .where(
      studentIds
        ? and(
            inArray(passportVersions.anchorStatus, [...OFFICIAL]),
            inArray(passportVersions.studentId, studentIds),
          )
        : inArray(passportVersions.anchorStatus, [...OFFICIAL]),
    )
    .groupBy(passportVersions.studentId);
  return new Map(rows.map((r) => [r.studentId, r.version ?? 0]));
}
