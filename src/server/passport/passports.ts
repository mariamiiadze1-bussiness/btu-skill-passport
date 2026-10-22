import { and, desc, eq, inArray } from "drizzle-orm";

import { sha256Bytes } from "../core/crypto";
import type { Db } from "../db/client";
import { OFFICIAL, orderedSkills, pdfInput } from "./issuance";
import { generatePassportPdf } from "../pdf/generate";
import { passportVersions, students } from "../db/schema";

export type PassportView = Awaited<ReturnType<typeof getPassportForStudent>>;

/** Everything the owner needs to view, compare and download their own passport versions. */
export async function getPassportForStudent(db: Db, studentId: string) {
  const [student] = await db.select().from(students).where(eq(students.id, studentId));
  if (!student) return null;
  const versionRows = await db
    .select()
    .from(passportVersions)
    .where(eq(passportVersions.studentId, studentId))
    .orderBy(desc(passportVersions.version));
  const official = versionRows.filter((v) =>
    (OFFICIAL as readonly string[]).includes(v.anchorStatus),
  );
  const latest = official[0]?.version ?? 0;
  const skillRows = await orderedSkills(db, [...new Set(versionRows.flatMap((v) => v.skillIds))]);
  const skillById = new Map(skillRows.map((s) => [s.id, s]));

  return {
    student: {
      firstName: student.firstName,
      lastName: student.lastName,
      program: student.program,
      passportId: student.passportId,
      originalIssueDate: student.issuedAt,
    },
    /** A version is still being recorded on the blockchain. */
    issuing: versionRows.some((v) => !(OFFICIAL as readonly string[]).includes(v.anchorStatus)),
    versions: official.map((v, i) => {
      const previous = new Set(official[i + 1]?.skillIds ?? []);
      return {
        version: v.version,
        issuedAt: v.issuedOn,
        verificationCode: v.verificationCode,
        isCurrent: v.version === latest,
        anchored: v.anchorStatus === "anchored",
        added: v.skillIds
          .filter((id) => !previous.has(id))
          .map((id) => skillById.get(id)?.name ?? id),
        skills: v.skillIds
          .map((id) => skillById.get(id))
          .filter((s) => !!s)
          .map((s) => ({
            id: s.id,
            name: s.name,
            category: s.category,
            badgeCode: s.badgeCode,
            description: s.description,
            dateEarned: s.dateEarned,
            earnedThrough: s.earnedThrough,
          })),
      };
    }),
  };
}

/**
 * Rebuilds an issued version's PDF and refuses to serve it unless it is byte-identical to
 * what was issued and anchored.
 */
export async function officialPdf(db: Db, studentId: string, version: number) {
  const [row] = await db
    .select({ v: passportVersions, s: students })
    .from(passportVersions)
    .innerJoin(students, eq(students.id, passportVersions.studentId))
    .where(
      and(
        eq(passportVersions.studentId, studentId),
        eq(passportVersions.version, version),
        inArray(passportVersions.anchorStatus, [...OFFICIAL]),
      ),
    );
  if (!row) return null;
  const pdf = await generatePassportPdf(
    pdfInput(row.s, row.v, await orderedSkills(db, row.v.skillIds)),
  );
  if (sha256Bytes(pdf) !== row.v.pdfSha256)
    throw new Error(
      "Integrity check failed: the regenerated PDF does not match the issued version.",
    );
  return { pdf, filename: `${row.s.passportId}-v${version}.pdf` };
}
