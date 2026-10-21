import { createHash } from "node:crypto";

import { allowedEmailDomain, isAllowedEmail } from "../email-domain";
import { isPrintable } from "../pdf/generate";
import { isSkillCategory, STAMP_CATEGORIES, type SkillCategory } from "../stamps";

/**
 * The registry sheet format ("Passport Skill Records" in BTU's workbook).
 * Columns are found by header text, not position, so reordering columns is harmless;
 * to support a renamed column, add the new header to its alias list.
 */
export const COLUMNS = {
  studentId: ["Student ID"],
  firstName: ["First Name"],
  lastName: ["Last Name"],
  email: ["BTU Email (Test)", "BTU Email", "Email"],
  program: ["Program"],
  educationLevel: ["Education Level"],
  passportId: ["Passport ID (Existing)", "Passport ID"],
  firstIssued: ["First Issued (Existing)", "First Issued"],
  studentStatus: ["Student Status"],
  recordId: ["Record ID"],
  skillId: ["Skill ID"],
  skillName: ["Skill Name"],
  category: ["Skill Category"],
  badgeCode: ["Badge/Stamp Code", "Badge Code"],
  description: ["Skill Description"],
  dateEarned: ["Date Earned"],
  // Optional columns.
  earnedThrough: ["Earned Through", "Activity", "Activity / Course"],
  verificationStatus: ["Verification Status", "Award Status"],
  // System-managed output (written back after each sync).
  syncStatus: ["Passport Sync Status"],
  syncedVersion: ["Synced Passport Version"],
  syncedAt: ["Synced At (UTC)"],
  syncNote: ["Sync Error / Notes"],
} as const;

export type Column = keyof typeof COLUMNS;
const REQUIRED: Column[] = [
  "studentId",
  "firstName",
  "lastName",
  "email",
  "recordId",
  "skillId",
  "skillName",
  "category",
  "description",
  "dateEarned",
];

export type CellValue = string | number | boolean | Date | null | undefined;
export type SheetTable = {
  rows: CellValue[][];
  /** 1-based sheet row number of rows[0]. */ firstRow?: number;
};

export type RegistryRow = {
  sheetRow: number;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  program: string;
  educationLevel: string;
  passportId: string;
  firstIssued: string;
  studentStatus: string;
  recordId: string;
  skillId: string;
  skillName: string;
  category: SkillCategory;
  badgeCode: string;
  description: string;
  dateEarned: string;
  earnedThrough: string;
  verificationStatus: string;
  syncStatus: string;
  syncedVersion: string;
};

export type ParsedSheet = {
  columns: Partial<Record<Column, number>>;
  headerRow: number;
  rows: (
    | { ok: true; row: RegistryRow }
    | { ok: false; sheetRow: number; recordId: string; studentId: string; errors: string[] }
  )[];
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function text(value: CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Accepts ISO dates, Excel date cells and Excel serial numbers. */
export function toIsoDate(value: CellValue): string | null {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000 && value < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  }
  const s = text(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s) ?? null;
  const dmy = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(s);
  const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * Demo data uses @example.org test addresses. EMAIL_DOMAIN_REWRITE=example.org maps them to
 * the allowed BTU domain; leave it empty in production.
 */
export function normalizeEmail(raw: string) {
  const email = raw.trim().toLowerCase();
  const from = process.env.EMAIL_DOMAIN_REWRITE?.trim().toLowerCase();
  if (from && email.endsWith(`@${from}`))
    return `${email.slice(0, -from.length)}${allowedEmailDomain()}`;
  return email;
}

const ID = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

export function parseSheet(table: SheetTable): ParsedSheet {
  const first = table.firstRow ?? 1;
  const headerIndex = table.rows.findIndex((r) => {
    const cells = r.map((c) => norm(text(c)));
    return cells.includes("student id") && cells.includes("record id");
  });
  if (headerIndex < 0)
    throw new Error('Could not find the header row (a row with "Student ID" and "Record ID").');
  const header = table.rows[headerIndex]!.map((c) => norm(text(c)));
  const columns: Partial<Record<Column, number>> = {};
  for (const [key, aliases] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
    const i = header.findIndex((h) => aliases.some((a) => norm(a) === h));
    if (i >= 0) columns[key] = i;
  }
  const missing = REQUIRED.filter((c) => columns[c] === undefined);
  if (missing.length)
    throw new Error(`Missing required columns: ${missing.map((c) => COLUMNS[c][0]).join(", ")}.`);

  const rows: ParsedSheet["rows"] = [];
  table.rows.slice(headerIndex + 1).forEach((cells, offset) => {
    const sheetRow = first + headerIndex + 1 + offset;
    const raw = (c: Column) => (columns[c] === undefined ? undefined : cells[columns[c]!]);
    const get = (c: Column) => text(raw(c));
    const studentId = get("studentId").toUpperCase();
    const recordId = get("recordId").toUpperCase();
    // Skip blank rows and the workbook's notes section below the data.
    if (!studentId && !recordId) return;
    if (!recordId && !ID.test(studentId)) return;

    const errors: string[] = [];
    for (const c of REQUIRED) if (!get(c)) errors.push(`${COLUMNS[c][0]} is empty`);
    if (studentId && !ID.test(studentId)) errors.push(`Student ID "${studentId}" is not valid`);
    if (recordId && !ID.test(recordId)) errors.push(`Record ID "${recordId}" is not valid`);
    const skillId = get("skillId").toUpperCase();
    if (skillId && !ID.test(skillId)) errors.push(`Skill ID "${skillId}" is not valid`);
    const category = get("category");
    if (category && !isSkillCategory(category))
      errors.push(
        `Skill Category "${category}" must be one of: ${Object.keys(STAMP_CATEGORIES).join(", ")}`,
      );
    const derivedBadge = isSkillCategory(category) ? STAMP_CATEGORIES[category].badgeCode : "";
    const badge = get("badgeCode");
    if (badge && derivedBadge && badge !== derivedBadge && badge !== "CHECK CATEGORY")
      errors.push(`Badge/Stamp Code ${badge} does not match category (${derivedBadge})`);
    const dateEarned = toIsoDate(raw("dateEarned"));
    if (get("dateEarned") && !dateEarned)
      errors.push(`Date Earned "${get("dateEarned")}" is not a valid date`);
    const firstIssued = get("firstIssued") ? toIsoDate(raw("firstIssued")) : "";
    if (firstIssued === null)
      errors.push(`First Issued "${get("firstIssued")}" is not a valid date`);
    const email = normalizeEmail(get("email"));
    if (email && !isAllowedEmail(email))
      errors.push(`Email must be an @${allowedEmailDomain()} address`);
    for (const c of [
      "firstName",
      "lastName",
      "skillName",
      "description",
      "earnedThrough",
    ] as const) {
      if (!isPrintable(get(c)))
        errors.push(`${COLUMNS[c][0]} has characters the passport cannot print`);
    }
    const passportId = get("passportId").toUpperCase();
    if (passportId && !/^BTU-AI-\d{6}$/.test(passportId))
      errors.push(`Passport ID "${passportId}" is not valid`);

    if (errors.length) {
      rows.push({ ok: false, sheetRow, recordId, studentId, errors });
      return;
    }
    rows.push({
      ok: true,
      row: {
        sheetRow,
        studentId,
        firstName: get("firstName").replace(/\s+/g, " "),
        lastName: get("lastName").replace(/\s+/g, " "),
        email,
        program: get("program"),
        educationLevel: get("educationLevel"),
        passportId,
        firstIssued: firstIssued || "",
        studentStatus: get("studentStatus") || "Active",
        recordId,
        skillId,
        skillName: get("skillName"),
        category: category as SkillCategory,
        badgeCode: derivedBadge,
        description: get("description"),
        dateEarned: dateEarned!,
        earnedThrough: get("earnedThrough"),
        verificationStatus: get("verificationStatus").toUpperCase(),
        syncStatus: get("syncStatus").toUpperCase(),
        syncedVersion: get("syncedVersion").toUpperCase(),
      },
    });
  });
  return { columns, headerRow: first + headerIndex, rows };
}

/** Fingerprint of a record's verified content (A–P); system-managed columns are excluded. */
export function rowHash(r: RegistryRow) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        r.studentId,
        r.recordId,
        r.skillId,
        r.skillName,
        r.category,
        r.description,
        r.dateEarned,
        r.earnedThrough,
      ]),
    )
    .digest("hex");
}
