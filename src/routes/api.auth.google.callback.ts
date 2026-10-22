import { createFileRoute } from "@tanstack/react-router";

import {
  AuthError,
  getSessionUser,
  SESSION_TTL_SECONDS,
  signInWithGoogle,
} from "@/server/auth/accounts";
import { readCookie, serializeCookie, SESSION_COOKIE } from "@/server/auth/cookies";
import { getDb } from "@/server/db/client";
import { completeAuth, GoogleAuthError, OAUTH_COOKIE } from "@/server/auth/google";

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clearState = serializeCookie(OAUTH_COOKIE, "", { maxAge: 0 });
        const fail = (code: string) => {
          const headers = new Headers({
            location: new URL(`/auth?error=${code}`, request.url).toString(),
            "cache-control": "no-store",
          });
          headers.append("set-cookie", clearState);
          return new Response(null, { status: 302, headers });
        };
        if (new URL(request.url).searchParams.has("error")) return fail("cancelled");
        try {
          const identity = await completeAuth(request.url, readCookie(request, OAUTH_COOKIE));
          const db = await getDb();
          const token = await signInWithGoogle(db, identity);
          const user = await getSessionUser(db, token);
          const headers = new Headers({
            location: new URL(user?.role === "admin" ? "/admin" : "/", request.url).toString(),
            "cache-control": "no-store",
          });
          headers.append("set-cookie", clearState);
          headers.append(
            "set-cookie",
            serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_SECONDS }),
          );
          return new Response(null, { status: 302, headers });
        } catch (error) {
          if (error instanceof GoogleAuthError) return fail(error.code);
          if (error instanceof AuthError)
            return fail(
              error.message.startsWith("No BTU passport")
                ? "no_account"
                : error.message.startsWith("Use your")
                  ? "domain"
                  : "linked",
            );
          console.error(error);
          return fail("server");
        }
      },
    },
  },
});
