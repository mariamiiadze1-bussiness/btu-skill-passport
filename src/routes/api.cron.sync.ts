import { createFileRoute } from "@tanstack/react-router";

import { hasBearer, triggeredSync } from "@/server/sync-trigger";

/** Scheduled safety net (Vercel Cron sends CRON_SECRET): re-syncs and retries pending blockchain anchors. */
export const Route = createFileRoute("/api/cron/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasBearer(request, process.env.CRON_SECRET))
          return new Response("Unauthorized", { status: 401 });
        return triggeredSync();
      },
    },
  },
});
