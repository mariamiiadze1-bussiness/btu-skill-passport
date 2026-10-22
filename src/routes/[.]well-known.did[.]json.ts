import { createFileRoute } from "@tanstack/react-router";

import { appUrl } from "@/server/core/config";
import { didDocument } from "@/server/blockchain/issuer";

/**
 * BTU's issuer identity (W3C did:web). Served from BTU's own domain, it binds the issuer
 * address that signs passports and sends the blockchain anchors to the university.
 */
export const Route = createFileRoute("/.well-known/did.json")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(didDocument(appUrl()), null, 2), {
          headers: {
            "content-type": "application/did+json",
            "cache-control": "public, max-age=300",
            "access-control-allow-origin": "*",
          },
        }),
    },
  },
});
