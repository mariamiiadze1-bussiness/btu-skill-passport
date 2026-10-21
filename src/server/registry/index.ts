import type { Db } from "../db";
import { googleSheetsConfig, googleSheetsSource, type RegistrySource } from "./sources";
import { runSync, type SyncResult } from "./sync";

export { excelSource, googleSheetsConfig, testWorkbookSource, writeBackCells } from "./sources";
export type { RegistrySource } from "./sources";
export type { RowOutcome, SyncResult } from "./sync";

/** The live registry: Google Sheets when configured (REGISTRY_SOURCE=google-sheets). */
export function configuredRegistrySource(): RegistrySource | null {
  const choice = process.env.REGISTRY_SOURCE ?? (googleSheetsConfig() ? "google-sheets" : "none");
  if (choice === "google-sheets") return googleSheetsSource();
  return null;
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
