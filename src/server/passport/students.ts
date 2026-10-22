import { randomInt } from "node:crypto";

import { desc, like } from "drizzle-orm";

import type { Db } from "../db/client";
import { students } from "../db/schema";

/** Next free permanent Passport ID (BTU-AI-000143 after BTU-AI-000142). */
export async function nextPassportId(db: Db) {
  const [last] = await db
    .select({ id: students.passportId })
    .from(students)
    .where(like(students.passportId, "BTU-AI-%"))
    .orderBy(desc(students.passportId))
    .limit(1);
  const n = last ? Number(last.id.slice(7)) + 1 : 1;
  return `BTU-AI-${String(n).padStart(6, "0")}`;
}

/** Temporary ID for a student who registered before appearing in the BTU registry. */
export function selfRegisteredStudentId() {
  return `BTU-S-${String(randomInt(0, 1e8)).padStart(8, "0")}`;
}

export const isSelfRegistered = (id: string) => id.startsWith("BTU-S-");

/**
 * Status of a student who signed up themselves (Google or email) and is not in BTU's registry
 * yet. An administrator approves them, or a registry row for their email confirms them.
 */
export const PENDING_APPROVAL = "Pending approval";

export const sameName = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
