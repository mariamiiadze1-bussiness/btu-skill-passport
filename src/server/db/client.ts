import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let dbPromise: Promise<Db> | undefined;

/** Loads `.env` for local runs; hosted platforms (Vercel) inject env vars themselves. */
export function loadLocalEnv() {
  if (process.env.VERCEL) return;
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file — fine when variables come from the shell.
  }
}

export function getDb(): Promise<Db> {
  dbPromise ??= connect().catch((error) => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

/** Tests inject an in-memory database. */
export function setDb(db: Db) {
  dbPromise = Promise.resolve(db);
}

async function connect(): Promise<Db> {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // prepare:false keeps queries parameterized while staying compatible with pooled
    // (PgBouncer / Neon) connection strings used on serverless hosts.
    const client = postgres(url, { max: process.env.VERCEL ? 1 : 5, prepare: false });
    return drizzle(client, { schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is not set. Add it to your environment (see .env.example).");
  }
  return connectLocalPglite();
}

/** Embedded Postgres for local development, so no database install is needed. */
async function connectLocalPglite(): Promise<Db> {
  // Variable specifiers keep PGlite (a dev-only dependency) out of production bundles.
  const pgliteModule = "@electric-sql/pglite";
  const driverModule = "drizzle-orm/pglite";
  const migratorModule = "drizzle-orm/pglite/migrator";
  const { PGlite } = await import(/* @vite-ignore */ pgliteModule);
  const { drizzle } = await import(/* @vite-ignore */ driverModule);
  const { migrate } = await import(/* @vite-ignore */ migratorModule);
  const dataDir = process.env.PGLITE_DIR ?? ".data/pglite";
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema }) as Db;
  await migrate(db, { migrationsFolder: "drizzle" });
  const { seedDatabase } = await import("./seed");
  await seedDatabase(db, { onlyIfEmpty: true });
  const { watchExcelFile } = await import("../registry");
  watchExcelFile(db);
  return db;
}
