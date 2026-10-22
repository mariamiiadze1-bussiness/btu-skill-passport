import { sql } from "drizzle-orm";

import type { Db } from "../db/client";
import { sha256 } from "./crypto";
import { rateLimits } from "../db/schema";
import { UserError } from "./errors";

export class RateLimitError extends UserError {
  constructor() {
    super("Too many attempts. Please wait a few minutes and try again.");
  }
}

/**
 * Fixed-window counter stored in Postgres, so limits hold across serverless instances.
 * Returns true when the call is within the limit.
 */
export async function hitRateLimit(db: Db, key: string, limit: number, windowSeconds: number) {
  const id = sha256(key);
  const windowStart = new Date();
  const cutoff = new Date(windowStart.getTime() - windowSeconds * 1000);
  const [row] = await db
    .insert(rateLimits)
    .values({ key: id, count: 1, windowStart })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < ${cutoff.toISOString()}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < ${cutoff.toISOString()}::timestamptz then ${windowStart.toISOString()}::timestamptz else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return (row?.count ?? 1) <= limit;
}

export async function enforceRateLimit(db: Db, key: string, limit: number, windowSeconds: number) {
  if (!(await hitRateLimit(db, key, limit, windowSeconds))) throw new RateLimitError();
}

export async function clearRateLimit(db: Db, key: string) {
  await db.delete(rateLimits).where(sql`${rateLimits.key} = ${sha256(key)}`);
}
