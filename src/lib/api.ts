import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestIP, setCookie } from "@tanstack/react-start/server";

import {
  addSkill,
  getAdminOverview,
  importExcel,
  retryAnchoring,
  syncRegistry,
} from "@/server/admin";
import {
  getSessionUser,
  login,
  logout,
  register,
  startRegistration,
  SESSION_TTL_SECONDS,
} from "@/server/auth/accounts";
import { SESSION_COOKIE } from "@/server/auth/cookies";
import { getDb } from "@/server/db/client";
import { allowedEmailDomain } from "@/server/core/config";
import { UserError } from "@/server/core/errors";
import { googleConfig } from "@/server/auth/google";
import { anchorPending } from "@/server/passport/issuance";
import { markNotificationsRead, unreadNotifications } from "@/server/core/notifications";
import { getPassportForStudent } from "@/server/passport/passports";
import { verifyPassportCode, verifyPdfHash } from "@/server/passport/verify";

/**
 * Server functions: the only bridge between pages and the server. Each one reads the session
 * from the httpOnly cookie itself; nothing the browser sends is trusted for identity or role.
 */

function clientKey() {
  return getRequestIP({ xForwardedFor: !!process.env.VERCEL }) ?? "local";
}

function setSessionCookie(token: string) {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

async function currentUser() {
  return getSessionUser(await getDb(), getCookie(SESSION_COOKIE));
}

/** UserError messages pass through; anything else is logged and replaced, so internals never leak. */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof UserError) throw new Error(error.message);
    if (error instanceof Error && error.name === "ZodError") {
      const issue = (error as unknown as { issues?: { message?: string }[] }).issues?.[0]?.message;
      throw new Error(
        issue && issue !== "Required" && !issue.startsWith("Invalid") ? issue : "Invalid request.",
      );
    }
    console.error(error);
    throw new Error("Something went wrong. Please try again.");
  }
}

const asObject = (input: unknown) =>
  input && typeof input === "object" ? (input as Record<string, unknown>) : {};

export const getSession = createServerFn({ method: "GET" }).handler(() =>
  guarded(async () => {
    const user = await currentUser();
    return user ? { email: user.email, role: user.role, name: user.name } : null;
  }),
);

/** What the sign-in page needs to know; contains no secrets. */
export const getAuthOptions = createServerFn({ method: "GET" }).handler(() => ({
  googleEnabled: googleConfig() !== null,
  emailDomain: allowedEmailDomain(),
}));

export const signIn = createServerFn({ method: "POST" })
  .validator(asObject)
  .handler(({ data }) =>
    guarded(async () => {
      setSessionCookie(await login(await getDb(), data, clientKey()));
      return { ok: true };
    }),
  );

export const requestSignUpCode = createServerFn({ method: "POST" })
  .validator(asObject)
  .handler(({ data }) =>
    guarded(async () => startRegistration(await getDb(), data, clientKey())),
  );

export const signUp = createServerFn({ method: "POST" })
  .validator(asObject)
  .handler(({ data }) =>
    guarded(async () => {
      setSessionCookie(await register(await getDb(), data, clientKey()));
      return { ok: true };
    }),
  );

export const signOut = createServerFn({ method: "POST" }).handler(() =>
  guarded(async () => {
    await logout(await getDb(), getCookie(SESSION_COOKIE));
    deleteCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }),
);

/** The signed-in student's own passport; nobody can request another student's. */
export const getMyPassport = createServerFn({ method: "GET" }).handler(() =>
  guarded(async () => {
    const user = await currentUser();
    if (!user?.studentId) return null;
    const db = await getDb();
    let passport = await getPassportForStudent(db, user.studentId);
    // A version still being recorded on-chain: check once (no waiting) and refresh.
    if (passport?.issuing) {
      await anchorPending(db, { waitMs: 0 }).catch(() => null);
      passport = await getPassportForStudent(db, user.studentId);
    }
    return (
      passport && { ...passport, notifications: await unreadNotifications(db, user.studentId) }
    );
  }),
);

export const dismissNotifications = createServerFn({ method: "POST" }).handler(() =>
  guarded(async () => {
    const user = await currentUser();
    if (user?.studentId) await markNotificationsRead(await getDb(), user.studentId);
    return { ok: true };
  }),
);

export const verifyCode = createServerFn({ method: "POST" })
  .validator(asObject)
  .handler(({ data }) =>
    guarded(async () =>
      verifyPassportCode(await getDb(), data["code"], clientKey(), data["fileSha256"]),
    ),
  );

export const verifyFile = createServerFn({ method: "POST" })
  .validator(asObject)
  .handler(({ data }) =>
    guarded(async () => verifyPdfHash(await getDb(), data["fileSha256"], clientKey())),
  );

export const getAdminData = createServerFn({ method: "GET" }).handler(() =>
  guarded(async () => getAdminOverview(await getDb(), await currentUser())),
);

export const syncNow = createServerFn({ method: "POST" }).handler(() =>
  guarded(async () => syncRegistry(await getDb(), await currentUser())),
);

export const uploadRegistryExcel = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!(input instanceof FormData)) throw new UserError("Upload an .xlsx file.");
    return input;
  })
  .handler(({ data }) =>
    guarded(async () => {
      const file = data.get("file");
      return importExcel(await getDb(), await currentUser(), file instanceof File ? file : null);
    }),
  );

export const addStudentSkill = createServerFn({ method: "POST" })
  .validator(asObject)
  .handler(({ data }) => guarded(async () => addSkill(await getDb(), await currentUser(), data)));

export const retryBlockchain = createServerFn({ method: "POST" }).handler(() =>
  guarded(async () => retryAnchoring(await getDb(), await currentUser())),
);
