import { createFileRoute } from "@tanstack/react-router";

import { serializeCookie } from "@/server/auth/cookies";
import { getDb } from "@/server/db/client";
import { createAuthRequest, GoogleAuthError, OAUTH_COOKIE } from "@/server/auth/google";
import { hitRateLimit } from "@/server/core/rate-limit";

export const Route = createFileRoute("/api/auth/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Proxy headers are only trustworthy behind Vercel's edge.
        const ip =
          (process.env.VERCEL && request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) ||
          "local";
        if (!(await hitRateLimit(await getDb(), `google:${ip}`, 30, 10 * 60)))
          return redirectToAuth(request, "rate");
        try {
          const { url, cookie } = createAuthRequest(request.url);
          return new Response(null, {
            status: 302,
            headers: {
              location: url,
              "set-cookie": serializeCookie(OAUTH_COOKIE, cookie, { maxAge: 600 }),
              "cache-control": "no-store",
            },
          });
        } catch (error) {
          if (error instanceof GoogleAuthError) return redirectToAuth(request, error.code);
          throw error;
        }
      },
    },
  },
});

export function redirectToAuth(request: Request, error: string) {
  return Response.redirect(
    new URL(`/auth?error=${encodeURIComponent(error)}`, request.url).toString(),
    302,
  );
}
