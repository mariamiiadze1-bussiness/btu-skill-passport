import { randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "../db/client";
import {
  getDummyHash,
  hashPassword,
  newSessionToken,
  sha256,
  verifyPassword,
} from "../core/crypto";
import { allowedEmailDomain, isAllowedEmail } from "../core/config";
import { isPrintable } from "../pdf/generate";
import { clearRateLimit, enforceRateLimit } from "../core/rate-limit";
import { emailCodes, sessions, students, users } from "../db/schema";
import { getMailer } from "../core/notifications";
import { nextPassportId, PENDING_APPROVAL, selfRegisteredStudentId } from "../passport/students";
import { UserError } from "../core/errors";

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

const confirmSchema = registerSchema.extend({
  code: z
    .string({ required_error: "Enter the 6-digit code from the email." })
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
});

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const codeHash = (email: string, code: string) => sha256(`signup:${email}:${code}`);

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
  // Caps guessing at one account even when the attempts come from many IP addresses.
  await enforceRateLimit(db, `login-email:${email}`, 20, 60 * 60);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw new AuthError(INVALID_LOGIN);

  await clearRateLimit(db, limitKey);
  await clearRateLimit(db, `login-email:${email}`);
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
      status: PENDING_APPROVAL,
    })
    .returning();
  return created!.id;
}

function parseRegistration<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new AuthError(parsed.error.issues[0]?.message ?? "Check your details and try again.");
  return parsed.data;
}

async function requireNewAccount(db: Db, email: string) {
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken) throw new AuthError("An account already exists for this email. Sign in instead.");
}

/**
 * Registration step 1: emails a 6-digit code to the BTU address. No account exists until the
 * code comes back (step 2), so nobody can claim a student's passport with an email they don't own.
 * Outside production the code is also returned, so the flow can be tried without a mail provider.
 */
export async function startRegistration(db: Db, input: unknown, clientKey: string) {
  const { email, firstName, lastName } = parseRegistration(registerSchema, input);
  requireBtuEmail(email);
  await enforceRateLimit(db, `register:${clientKey}`, 10, 60 * 60);
  await enforceRateLimit(db, `register-email:${email}`, 5, 60 * 60);
  await requireNewAccount(db, email);
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.email, email));
  if (!student && (!firstName || !lastName))
    throw new AuthError("Enter your first and last name to create your passport.");

  const mailer = getMailer();
  const production = process.env.NODE_ENV === "production";
  if (production && !mailer.delivers)
    throw new AuthError("Email sign-up is not available yet. Sign in with Google instead.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row = {
    codeHash: codeHash(email, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    attempts: 0,
  };
  await db
    .insert(emailCodes)
    .values({ email, ...row })
    .onConflictDoUpdate({ target: emailCodes.email, set: row });
  await mailer.send({
    to: email,
    subject: "Your BTU AI Skills Passport code",
    text: `Your sign-up code is ${code}. It expires in 10 minutes.

If you did not try to create a BTU AI Skills Passport account, ignore this email.`,
  });
  return { devCode: production ? undefined : code };
}

/** Registration step 2: checks the emailed code, then creates the account and signs it in. */
export async function register(db: Db, input: unknown, clientKey: string) {
  const { email, password, firstName, lastName, code } = parseRegistration(confirmSchema, input);
  requireBtuEmail(email);
  await enforceRateLimit(db, `register:${clientKey}`, 10, 60 * 60);

  const [pending] = await db.select().from(emailCodes).where(eq(emailCodes.email, email));
  if (!pending || pending.expiresAt < new Date() || pending.attempts >= CODE_MAX_ATTEMPTS) {
    if (pending) await db.delete(emailCodes).where(eq(emailCodes.email, email));
    throw new AuthError("This code has expired. Request a new one.");
  }
  const matches = timingSafeEqual(
    Buffer.from(codeHash(email, code)),
    Buffer.from(pending.codeHash),
  );
  if (!matches) {
    await db
      .update(emailCodes)
      .set({ attempts: pending.attempts + 1 })
      .where(eq(emailCodes.email, email));
    throw new AuthError("That code is not correct.");
  }
  await db.delete(emailCodes).where(eq(emailCodes.email, email));

  await requireNewAccount(db, email);
  const studentId = await studentForEmail(db, email, { firstName, lastName });
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, emailVerifiedAt: new Date(), role: "student", studentId })
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
    // A password set before the mailbox was ever proven may not be the student's own: drop it.
    await db
      .update(users)
      .set({
        googleSub: identity.sub,
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        passwordHash: byEmail.emailVerifiedAt ? byEmail.passwordHash : null,
      })
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
