import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "./db";
import { getDummyHash, hashPassword, newSessionToken, sha256, verifyPassword } from "./crypto";
import { allowedEmailDomain, isAllowedEmail } from "./email-domain";
import { isPrintable } from "./pdf/generate";
import { clearRateLimit, enforceRateLimit } from "./rate-limit";
import { sessions, students, users } from "./schema";
import { nextPassportId, selfRegisteredStudentId } from "./students";
import { UserError } from "./errors";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

const personName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter your ${label}.`)
    .max(60, `Your ${label} is too long.`)
    .refine(isPrintable, `Write your ${label} in Latin letters, as on your university record.`)
    .transform((v) => v.replace(/\s+/g, " "));

export const registerSchema = credentialsSchema.extend({
  password: z.string().min(10, "Use a password with at least 10 characters.").max(200),
  firstName: personName("first name").optional(),
  lastName: personName("last name").optional(),
});

export class AuthError extends UserError {}

function requireBtuEmail(email: string) {
  if (!isAllowedEmail(email))
    throw new AuthError(`Use your @${allowedEmailDomain()} university email.`);
}

export type SessionUser = {
  id: string;
  email: string;
  role: "student" | "admin";
  studentId: string | null;
  name: string | null;
};

async function createSession(db: Db, userId: string) {
  const token = newSessionToken();
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  });
  return token;
}

/** Same message for unknown email and wrong password, so accounts can't be enumerated. */
const INVALID_LOGIN = "Email or password is incorrect.";

export async function login(db: Db, input: unknown, clientKey: string) {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) throw new AuthError(INVALID_LOGIN);
  const { email, password } = parsed.data;
  requireBtuEmail(email);
  const limitKey = `login:${clientKey}:${email}`;
  await enforceRateLimit(db, limitKey, 8, 15 * 60);
  await enforceRateLimit(db, `login-ip:${clientKey}`, 40, 15 * 60);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw new AuthError(INVALID_LOGIN);

  await clearRateLimit(db, limitKey);
  return createSession(db, user.id);
}

/**
 * Quick registration. A BTU email already in the registry links to that student's passport.
 * Otherwise the student's passport is reserved (permanent Passport ID, name) and shown at once,
 * but BTU only issues it officially — signed and anchored — once BTU's own data confirms the
 * student (the registry lists them, or an administrator adds their first skill).
 */
async function studentForEmail(
  db: Db,
  email: string,
  names: { firstName?: string | undefined; lastName?: string | undefined },
) {
  const [existing] = await db.select().from(students).where(eq(students.email, email));
  if (existing) return existing.id;
  if (!names.firstName || !names.lastName)
    throw new AuthError("Enter your first and last name to create your passport.");
  const [created] = await db
    .insert(students)
    .values({
      id: selfRegisteredStudentId(),
      firstName: names.firstName,
      lastName: names.lastName,
      email,
      passportId: await nextPassportId(db),
      issuedAt: new Date().toISOString().slice(0, 10),
    })
    .returning();
  return created!.id;
}

export async function register(db: Db, input: unknown, clientKey: string) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success)
    throw new AuthError(parsed.error.issues[0]?.message ?? "Check your details and try again.");
  const { email, password, firstName, lastName } = parsed.data;
  requireBtuEmail(email);
  await enforceRateLimit(db, `register:${clientKey}`, 10, 60 * 60);

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken) throw new AuthError("An account already exists for this email. Sign in instead.");
  const studentId = await studentForEmail(db, email, { firstName, lastName });
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, role: "student", studentId })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (!user) throw new AuthError("An account already exists for this email. Sign in instead.");
  return createSession(db, user.id);
}

/**
 * Signs in a Google account whose ID token has already been verified (see google.ts).
 * Links by Google's stable subject ID first, then by email. A new BTU account gets its
 * passport straight away, using the name on the Google Workspace profile. Never creates admins.
 */
export async function signInWithGoogle(
  db: Db,
  identity: {
    sub: string;
    email: string;
    firstName?: string | undefined;
    lastName?: string | undefined;
  },
) {
  const email = identity.email.trim().toLowerCase();
  requireBtuEmail(email);
  const [bySub] = await db.select().from(users).where(eq(users.googleSub, identity.sub));
  if (bySub) return createSession(db, bySub.id);

  const [byEmail] = await db.select().from(users).where(eq(users.email, email));
  if (byEmail) {
    if (byEmail.googleSub && byEmail.googleSub !== identity.sub)
      throw new AuthError("This account is linked to a different Google account.");
    await db
      .update(users)
      .set({ googleSub: identity.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() })
      .where(eq(users.id, byEmail.id));
    return createSession(db, byEmail.id);
  }

  const names = registerSchema.pick({ firstName: true, lastName: true }).safeParse(identity);
  const studentId = await studentForEmail(db, email, names.success ? names.data : {});
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: null,
      googleSub: identity.sub,
      emailVerifiedAt: new Date(),
      role: "student",
      studentId,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (!user) throw new AuthError("Could not create the account. Please try again.");
  return createSession(db, user.id);
}

export async function getSessionUser(
  db: Db,
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      studentId: users.studentId,
      firstName: students.firstName,
      lastName: students.lastName,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(students, eq(students.id, users.studentId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    studentId: row.studentId,
    name: row.firstName ? `${row.firstName} ${row.lastName}` : null,
  };
}

export async function logout(db: Db, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function purgeExpiredSessions(db: Db) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
