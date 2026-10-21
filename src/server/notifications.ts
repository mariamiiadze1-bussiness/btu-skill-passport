import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import type { Db } from "./db";
import { appUrl } from "./config";
import { getMailer } from "./mail";
import { notifications, passportVersions, skills, students } from "./schema";

/** Tells students a version is now official: an in-app notice plus an email (spec: optional notifications). */
export async function notifyIssued(db: Db, issued: { studentId: string; version: number }[]) {
  for (const { studentId, version } of issued) {
    const [student] = await db.select().from(students).where(eq(students.id, studentId));
    if (!student) continue;
    const rows = await db
      .select({ version: passportVersions.version, skillIds: passportVersions.skillIds })
      .from(passportVersions)
      .where(
        and(
          eq(passportVersions.studentId, studentId),
          inArray(passportVersions.version, [version, version - 1]),
        ),
      );
    const current = rows.find((r) => r.version === version)?.skillIds ?? [];
    const previous = new Set(rows.find((r) => r.version === version - 1)?.skillIds ?? []);
    const addedIds = current.filter((id) => !previous.has(id));
    const added = addedIds.length
      ? (
          await db.select({ name: skills.name }).from(skills).where(inArray(skills.id, addedIds))
        ).map((s) => s.name)
      : [];

    const title =
      version === 1
        ? "Your AI Skills Passport has been issued"
        : `Your passport was updated to v${version}`;
    const body = added.length
      ? `New verified skills: ${added.join(", ")}.`
      : version === 1
        ? "BTU will add your AI skills as they are confirmed."
        : "A new official version is available.";
    await db.insert(notifications).values({ studentId, title, body });
    await getMailer()
      .send({
        to: student.email,
        subject: title,
        text: `${body}\n\nView and download it: ${appUrl()}/`,
      })
      .catch((error: unknown) => console.error("Could not send notification email", error));
  }
}

export async function unreadNotifications(db: Db, studentId: string) {
  return db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.studentId, studentId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.id))
    .limit(5);
}

export async function markNotificationsRead(db: Db, studentId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.studentId, studentId), isNull(notifications.readAt)));
}
