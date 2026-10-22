import { createFileRoute } from "@tanstack/react-router";

import { getSessionUser } from "@/server/auth/accounts";
import { readCookie, SESSION_COOKIE } from "@/server/auth/cookies";
import { getDb } from "@/server/db/client";
import { officialPdf } from "@/server/passport/passports";

/** The signed-in student's own official PDF, rebuilt and integrity-checked against the issued hash. */
export const Route = createFileRoute("/api/passport/$version/pdf")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const version = Number(params.version);
        if (!Number.isInteger(version) || version < 1 || version > 10_000)
          return new Response("Not found", { status: 404 });
        const db = await getDb();
        const user = await getSessionUser(db, readCookie(request, SESSION_COOKIE));
        if (!user?.studentId)
          return new Response("Sign in to download your passport.", { status: 401 });
        const doc = await officialPdf(db, user.studentId, version);
        if (!doc) return new Response("Not found", { status: 404 });
        const download = new URL(request.url).searchParams.has("download");
        return new Response(doc.pdf as BodyInit, {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `${download ? "attachment" : "inline"}; filename="${doc.filename}"`,
            "cache-control": "private, no-store",
          },
        });
      },
    },
  },
});
