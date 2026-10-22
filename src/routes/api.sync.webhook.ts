import { createFileRoute } from "@tanstack/react-router";

import { hasBearer, triggeredSync } from "@/server/registry";

/** Called by the Google Sheet's Apps Script trigger on every edit (see README), so changes sync within seconds. */
export const Route = createFileRoute("/api/sync/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hasBearer(request, process.env.SYNC_WEBHOOK_SECRET))
          return new Response("Unauthorized", { status: 401 });
        return triggeredSync();
      },
    },
  },
});
