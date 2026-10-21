import { timingSafeEqual } from "node:crypto";

import { getDb } from "./db";
import { anchorPending } from "./issuance";
import { configuredRegistrySource, syncFromSource } from "./registry";

/** Constant-time check of "Authorization: Bearer <secret>". */
export function hasBearer(request: Request, secret: string | undefined) {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Shared by the Google Sheets webhook and the scheduled job. */
export async function triggeredSync() {
  const db = await getDb();
  const source = configuredRegistrySource();
  if (!source) {
    const anchor = await anchorPending(db);
    return Response.json({ ok: true, sync: "no registry configured", anchor });
  }
  try {
    const result = await syncFromSource(db, source, null);
    return Response.json({
      ok: true,
      totals: result.totals,
      anchorError: result.anchorError,
      writeBackError: result.writeBackError,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
