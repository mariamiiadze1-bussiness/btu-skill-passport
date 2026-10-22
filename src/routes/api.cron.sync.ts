import { createFileRoute } from "@tanstack/react-router";

import { purgeExpiredSessions } from "@/server/auth/accounts";
import { getDb } from "@/server/db/client";
import { hasBearer, triggeredSync } from "@/server/registry";

/**
 * Scheduled safety net (Vercel Cron sends CRON_SECRET): re-syncs, retries pending blockchain
 * anchors and deletes expired sign-in sessions.
 */
export const Route = createFileRoute("/api/cron/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasBearer(request, process.env.CRON_SECRET))
          return new Response("Unauthorized", { status: 401 });
        await purgeExpiredSessions(await getDb());
        return triggeredSync();
      },
    },
  },
});
