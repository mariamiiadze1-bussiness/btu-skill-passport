import { timingSafeEqual } from "node:crypto";
import { watchFile } from "node:fs";

import { getDb, type Db } from "../db/client";
import { anchorPending } from "../passport/issuance";
import {
  excelFilePath,
  excelFileSource,
  googleSheetsConfig,
  googleSheetsSource,
  type RegistrySource,
} from "./sources";
import { runSync, type SyncResult } from "./sync";

export {
  excelFilePath,
  excelFileSource,
  excelSource,
  googleSheetsConfig,
  testWorkbookSource,
  writeBackCells,
} from "./sources";
export type { RegistrySource } from "./sources";
export type { RowOutcome, SyncResult } from "./sync";

/**
 * The live registry: Google Sheets when configured, otherwise an Excel file on disk
 * (REGISTRY_EXCEL_PATH). REGISTRY_SOURCE=google-sheets | excel-file | none forces one.
 */
export function configuredRegistrySource(): RegistrySource | null {
  const file = excelFilePath();
  const choice =
    process.env.REGISTRY_SOURCE ??
    (googleSheetsConfig() ? "google-sheets" : file ? "excel-file" : "none");
  if (choice === "google-sheets") return googleSheetsSource();
  if (choice === "excel-file" && file) return excelFileSource(file);
  return null;
}

/** Shown in the admin panel: where "Sync now" reads from. */
export function registrySourceLabel() {
  const source = configuredRegistrySource();
  if (!source) return null;
  return source.id.startsWith("excel-file:")
    ? `Excel file ${source.id.slice("excel-file:".length)}`
    : "Google Sheets";
}

/**
 * Local development: syncs whenever the registry Excel file is saved, so editing the
 * workbook updates passports within seconds without pressing anything.
 */
export function watchExcelFile(db: Db) {
  const path = excelFilePath();
  if (!path || process.env.NODE_ENV === "production") return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  watchFile(path, { interval: 2000 }, (now, before) => {
    if (now.mtimeMs === before.mtimeMs) return;
    clearTimeout(timer);
    // Wait for Excel to finish writing before reading.
    timer = setTimeout(async () => {
      try {
        const { totals } = await syncFromSource(db, excelFileSource(path), null);
        console.info(`[registry] ${path} changed → synced`, totals);
      } catch (error) {
        console.warn(
          `[registry] could not sync ${path}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }, 1500);
  });
  console.info(`[registry] watching ${path} — save it to sync`);
}

/** Read → sync → write results back to the source (if it supports it). */
export async function syncFromSource(
  db: Db,
  source: RegistrySource,
  actorUserId?: string | null,
): Promise<SyncResult & { writeBackError: string | null }> {
  const workbook = await source.read();
  const result = await runSync(db, workbook, { source: source.id, actorUserId });
  let writeBackError: string | null = null;
  if (source.writeBack) {
    try {
      await source.writeBack(workbook, result);
    } catch (error) {
      writeBackError = error instanceof Error ? error.message : String(error);
    }
  }
  return { ...result, writeBackError };
}

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
