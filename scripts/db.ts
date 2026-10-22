// Usage: npm run db:migrate | db:seed | db:setup | db:sync   (reads settings from .env)
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";

import { getDb, loadLocalEnv } from "../src/server/db/client";
import { anchorPending } from "../src/server/passport/issuance";
import { configuredRegistrySource, syncFromSource } from "../src/server/registry";
import { seedDatabase } from "../src/server/db/seed";

loadLocalEnv();
const command = process.argv[2];
if (!process.env.DATABASE_URL && command !== "sync") {
  console.log(
    "DATABASE_URL is not set: the embedded local database migrates and seeds itself on first run.",
  );
  process.exit(0);
}

const db = await getDb();
if (command === "migrate" || command === "setup") {
  await migratePg(db as never, { migrationsFolder: "drizzle" });
  console.log("✓ Migrations applied");
}
if (command === "seed" || command === "setup") {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
    console.warn("! ADMIN_EMAIL / ADMIN_PASSWORD not set — no admin account created.");
  await seedDatabase(db);
  console.log("✓ Seed data loaded");
}
if (command === "sync") {
  // Bulk runs (e.g. thousands of passports at the start of a year) have no request timeout here.
  const source = configuredRegistrySource();
  if (!source) throw new Error("No registry configured (GOOGLE_SHEETS_* variables).");
  const result = await syncFromSource(db, source);
  console.log("✓ Sync", result.totals, result.anchorError ?? "", result.writeBackError ?? "");
  console.log("✓ Anchoring", await anchorPending(db));
}
process.exit(0);
