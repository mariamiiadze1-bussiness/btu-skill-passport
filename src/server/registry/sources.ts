import { importPKCS8, SignJWT } from "jose";
import readSheet from "read-excel-file/universal";

import { UserError } from "../errors";
import { TEST_SHEET_HEADER, TEST_SHEET_ROWS } from "../seed-data";
import { parseWorkbook, type CellValue, type Column, type Workbook } from "./format";
import type { RowOutcome, SyncResult } from "./sync";

/**
 * Where verified skill records come from. Each source returns the raw workbook (every tab);
 * parsing, validation and syncing are shared. To add a source (e.g. a BTU API), implement this.
 */
export interface RegistrySource {
  readonly id: string;
  read(): Promise<Workbook>;
  /** Writes results back (Passport ID and the sync columns). Excel uploads have nowhere to write. */
  writeBack?(workbook: Workbook, result: SyncResult): Promise<void>;
}

/** The workbook BTU supplied for the hackathon, bundled for seeding and offline demos. */
export const testWorkbookSource: RegistrySource = {
  id: "test-workbook",
  read: async () => ({
    tabs: [
      {
        name: "Passport Skill Records",
        rows: [[...TEST_SHEET_HEADER], ...TEST_SHEET_ROWS],
        firstRow: 3,
      },
    ],
  }),
};

export function excelSource(bytes: ArrayBuffer): RegistrySource {
  return {
    id: "excel-upload",
    async read() {
      const sheets = await readSheet(bytes);
      if (!sheets.length) throw new UserError("The workbook has no sheets.");
      return {
        tabs: sheets.map((s) => ({ name: s.sheet, rows: s.data as CellValue[][], firstRow: 1 })),
      };
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
  return { spreadsheetId, email, key };
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

/** Cell updates for the sync columns (Q–T) and Passport ID (G, or the Students tab). */
export function writeBackCells(workbook: Workbook, result: SyncResult) {
  const parsed = parseWorkbook(workbook);
  const stamp = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const cells: { tab: string; row: number; col: number; value: string }[] = [];
  const at = (tab: string, c: Column) => parsed.columns[tab]?.[c] ?? -1;
  const put = (tab: string, row: number, c: Column, value: string) => {
    const col = at(tab, c);
    if (col >= 0) cells.push({ tab, row, col, value });
  };

  for (const o of result.outcomes) {
    if (!o.recordId) continue;
    // Rows already reported as synced keep their original timestamp.
    if (o.status === "already_synced" && o.sheetStatus === "SYNCED") continue;
    const official = o.status === "synced" || o.status === "already_synced";
    put(o.tab, o.sheetRow, "syncStatus", SHEET_STATUS[o.status]);
    put(o.tab, o.sheetRow, "syncedVersion", official && o.version ? `V${o.version}` : "");
    put(o.tab, o.sheetRow, "syncedAt", official ? stamp : "");
    put(o.tab, o.sheetRow, "syncNote", official ? "" : o.message);
  }
  // The permanent Passport ID is written consistently to every row of the student.
  for (const r of parsed.rows) {
    const studentId = r.ok ? r.row.studentId : r.studentId;
    const passportId = result.passportIds[studentId];
    const current = r.ok ? r.row.passportId : "";
    if (passportId && current !== passportId)
      put(r.ok ? r.row.tab : r.tab, r.ok ? r.row.sheetRow : r.sheetRow, "passportId", passportId);
  }
  for (const s of parsed.students) {
    const passportId = result.passportIds[s.studentId];
    if (passportId && s.student?.passportId !== passportId)
      put(s.tab, s.sheetRow, "passportId", passportId);
  }
  return cells;
}

export function googleSheetsSource(): RegistrySource {
  const config = googleSheetsConfig();
  if (!config)
    throw new UserError(
      "Google Sheets is not configured (GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SERVICE_ACCOUNT_*).",
    );
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}`;
  const quote = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

  return {
    id: "google-sheets",
    async read() {
      const token = await serviceAccountToken(config.email, config.key);
      const headers = { authorization: `Bearer ${token}` };
      const meta = await fetch(`${base}?fields=sheets.properties.title`, { headers });
      if (!meta.ok)
        throw new UserError(
          `Could not open the Google Sheet (${meta.status}). Is it shared with ${config.email}?`,
        );
      const titles = (
        (await meta.json()) as { sheets: { properties: { title: string } }[] }
      ).sheets.map((s) => s.properties.title);
      const ranges = titles
        .map((t) => `ranges=${encodeURIComponent(`${quote(t)}!A1:Z5000`)}`)
        .join("&");
      const response = await fetch(
        `${base}/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
        { headers },
      );
      if (!response.ok)
        throw new UserError(`Could not read the Google Sheet (${response.status}).`);
      const json = (await response.json()) as { valueRanges: { values?: string[][] }[] };
      return {
        tabs: titles.map((name, i) => ({
          name,
          rows: json.valueRanges[i]?.values ?? [],
          firstRow: 1,
        })),
      };
    },
    async writeBack(workbook, result) {
      const data = writeBackCells(workbook, result).map((c) => ({
        range: `${quote(c.tab)}!${columnLetter(c.col)}${c.row}`,
        values: [[c.value]],
      }));
      if (!data.length) return;
      const token = await serviceAccountToken(config.email, config.key);
      for (let i = 0; i < data.length; i += 500) {
        const response = await fetch(`${base}/values:batchUpdate`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ valueInputOption: "RAW", data: data.slice(i, i + 500) }),
        });
        if (!response.ok)
          throw new UserError(
            `Could not write sync results back to the sheet (${response.status}).`,
          );
      }
    },
  };
}
