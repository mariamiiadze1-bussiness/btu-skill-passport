import { importPKCS8, SignJWT } from "jose";
import readSheet from "read-excel-file/universal";

import { TEST_SHEET_HEADER, TEST_SHEET_ROWS } from "../seed-data";
import { COLUMNS, type CellValue, type Column, type SheetTable } from "./format";
import type { RowOutcome } from "./sync";
import { UserError } from "../errors";

/**
 * Where verified skill records come from. Each source returns the raw sheet table; parsing,
 * validation and syncing are shared. To add a source (e.g. a BTU API), implement RegistrySource.
 */
export interface RegistrySource {
  readonly id: string;
  read(): Promise<SheetTable>;
  /** Writes sync results back (columns G and Q–T). Optional: Excel uploads have nowhere to write. */
  writeBack?(table: SheetTable, outcomes: RowOutcome[]): Promise<void>;
}

/** The workbook BTU supplied for the hackathon, bundled for seeding and offline demos. */
export const testWorkbookSource: RegistrySource = {
  id: "test-workbook",
  read: async () => ({ rows: [[...TEST_SHEET_HEADER], ...TEST_SHEET_ROWS], firstRow: 3 }),
};

export function excelSource(
  bytes: ArrayBuffer,
  sheetName = process.env.GOOGLE_SHEETS_TAB || "Passport Skill Records",
): RegistrySource {
  return {
    id: "excel-upload",
    async read() {
      const sheets = await readSheet(bytes);
      const sheet = sheets.find((s) => s.sheet === sheetName) ?? sheets[0];
      if (!sheet) throw new UserError("The workbook has no sheets.");
      return { rows: sheet.data as CellValue[][], firstRow: 1 };
    },
  };
}

// ---------------------------------------------------------------------------------------
// Google Sheets (service account). Share the sheet with GOOGLE_SERVICE_ACCOUNT_EMAIL as Editor.

export function googleSheetsConfig() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!spreadsheetId || !email || !key) return null;
  return {
    spreadsheetId,
    email,
    key,
    tab: process.env.GOOGLE_SHEETS_TAB?.trim() || "Passport Skill Records",
  };
}

let cachedToken: { token: string; expires: number } | undefined;

async function serviceAccountToken(email: string, pem: string) {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(pem, "RS256"));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok)
    throw new UserError(
      `Google rejected the service account (${response.status}). Check GOOGLE_SERVICE_ACCOUNT_* values.`,
    );
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

const columnLetter = (index: number) => {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const SHEET_STATUS: Record<RowOutcome["status"], string> = {
  synced: "SYNCED",
  already_synced: "SYNCED",
  pending: "NOT SYNCED",
  skipped: "NOT SYNCED",
  failed: "FAILED",
};

export function googleSheetsSource(): RegistrySource {
  const config = googleSheetsConfig();
  if (!config)
    throw new UserError(
      "Google Sheets is not configured (GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SERVICE_ACCOUNT_*).",
    );
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values`;
  const range = `'${config.tab.replace(/'/g, "''")}'`;

  return {
    id: "google-sheets",
    async read() {
      const token = await serviceAccountToken(config.email, config.key);
      const response = await fetch(
        `${base}/${encodeURIComponent(`${range}!A1:Z5000`)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok)
        throw new UserError(
          `Could not read the Google Sheet (${response.status}). Is it shared with ${config.email}?`,
        );
      const json = (await response.json()) as { values?: string[][] };
      return { rows: json.values ?? [], firstRow: 1 };
    },
    async writeBack(table, outcomes) {
      const header =
        table.rows.find((r) => r.some((c) => String(c ?? "").trim() === "Record ID")) ?? [];
      const col = (c: Column) =>
        header.findIndex((h) => (COLUMNS[c] as readonly string[]).includes(String(h ?? "").trim()));
      const at = {
        passportId: col("passportId"),
        status: col("syncStatus"),
        version: col("syncedVersion"),
        syncedAt: col("syncedAt"),
        note: col("syncNote"),
      };
      const stamp = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
      const data: { range: string; values: string[][] }[] = [];
      const put = (index: number, row: number, value: string) => {
        if (index >= 0)
          data.push({ range: `${range}!${columnLetter(index)}${row}`, values: [[value]] });
      };
      for (const o of outcomes) {
        // Leave rows that were already reported as synced untouched (keeps their original timestamp).
        if (o.status === "already_synced" && o.sheetStatus === "SYNCED") continue;
        const official = o.status === "synced" || o.status === "already_synced";
        put(at.status, o.sheetRow, SHEET_STATUS[o.status]);
        put(at.version, o.sheetRow, official && o.version ? `V${o.version}` : "");
        put(at.syncedAt, o.sheetRow, official ? stamp : "");
        put(
          at.note,
          o.sheetRow,
          o.status === "synced" || o.status === "already_synced" ? "" : o.message,
        );
        if (o.passportId) put(at.passportId, o.sheetRow, o.passportId);
      }
      if (!data.length) return;
      const token = await serviceAccountToken(config.email, config.key);
      for (let i = 0; i < data.length; i += 500) {
        const response = await fetch(`${base}:batchUpdate`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ valueInputOption: "RAW", data: data.slice(i, i + 500) }),
        });
        if (!response.ok)
          throw new UserError(
            `Could not write sync status back to the sheet (${response.status}).`,
          );
      }
    },
  };
}
