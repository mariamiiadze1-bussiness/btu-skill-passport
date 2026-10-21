import { eq } from "drizzle-orm";

import type { Db } from "./db";
import { hashPassword } from "./crypto";
import { allowedEmailDomain, isAllowedEmail } from "./email-domain";
import { testWorkbookSource } from "./registry";
import { runSync } from "./registry/sync";
import { students, users } from "./schema";

export type SeedOptions = {
  onlyIfEmpty?: boolean;
  adminEmail?: string;
  adminPassword?: string;
  /** When set, every registry student also gets a ready-made account with this password (demo only). */
  studentPassword?: string;
};

/**
 * Loads BTU's hackathon workbook as the starting state: every student gets a passport, and
 * the records the workbook marks SYNCED form their first version. The NOT SYNCED records are
 * left for the first real sync, which demonstrates detecting and adding new skills.
 */
export async function seedDatabase(db: Db, options: SeedOptions = {}) {
  const adminEmail = (options.adminEmail ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? "";
  const studentPassword = options.studentPassword ?? process.env.SEED_STUDENT_PASSWORD ?? "";

  const [existing] = await db.select({ id: students.id }).from(students).limit(1);
  if (options.onlyIfEmpty && existing) return { seeded: false };

  if (adminEmail && !isAllowedEmail(adminEmail))
    throw new Error(`ADMIN_EMAIL must be an @${allowedEmailDomain()} address.`);
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12)
      throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
    const passwordHash = await hashPassword(adminPassword);
    await db
      .insert(users)
      .values({ email: adminEmail, passwordHash, role: "admin" })
      .onConflictDoUpdate({ target: users.email, set: { passwordHash, role: "admin" } });
  }

  if (!existing) {
    await runSync(db, await testWorkbookSource.read(), {
      source: "seed",
      filter: (row) => row.syncStatus === "SYNCED",
      ensurePassports: true,
    });
  }

  if (studentPassword) {
    const passwordHash = await hashPassword(studentPassword);
    for (const s of await db.select().from(students)) {
      const [found] = await db.select({ id: users.id }).from(users).where(eq(users.email, s.email));
      if (!found)
        await db
          .insert(users)
          .values({ email: s.email, passwordHash, role: "student", studentId: s.id });
    }
  }
  return { seeded: true };
}
