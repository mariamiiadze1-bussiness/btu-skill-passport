import { createHash } from "node:crypto";

import { allowedEmailDomain, isAllowedEmail } from "../core/config";
import { isPrintable } from "../pdf/generate";
import { isSkillCategory, STAMP_CATEGORIES, type SkillCategory } from "../passport/stamps";

/**
 * BTU's registry formats. Two layouts are accepted, both described in BTU's materials:
 *
 *  - Combined: one "Passport Skill Records" sheet, one row per awarded skill (the test workbook).
 *  - Registries: three tabs — Students, Skills Catalog, Verified Skills (brief, "Tab 3"),
 *    joined by Student ID and Skill ID.
 *
 * Columns are found by header text, never by position; to accept a renamed column,
 * add its header to the alias list below.
 */
export const COLUMNS = {
  studentId: ["Student ID"],
  firstName: ["First Name"],
  lastName: ["Last Name"],
  email: ["BTU Email (Test)", "BTU Email", "Email", "Test Email"],
  program: ["Program"],
  educationLevel: ["Education Level"],
  passportId: ["Passport ID (Existing)", "Passport ID"],
  firstIssued: ["First Issued (Existing)", "First Issued"],
  studentStatus: ["Student Status"],
  recordId: ["Record ID"],
  skillId: ["Skill ID", "Skill Code"],
  skillName: ["Skill Name"],
  category: ["Skill Category", "Category"],
  badgeCode: ["Badge/Stamp Code", "Badge Code", "Badge/Stamp ID", "Badge ID", "Stamp Code"],
  description: ["Skill Description", "Description"],
  dateEarned: ["Date Earned"],
  earnedThrough: ["Earned Through", "Activity", "Activity / Course"],
  /** CONFIRMED / PENDING / REJECTED — only CONFIRMED awards reach the passport. */
  verificationStatus: ["Verification Status", "Award Status", "Confirmation Status", "Status"],
  // System-managed output, written back after each sync (workbook columns Q–T).
  syncStatus: ["Passport Sync Status"],
  syncedVersion: ["Synced Passport Version"],
  syncedAt: ["Synced At (UTC)"],
  syncNote: ["Sync Error / Notes"],
} as const;

export type Column = keyof typeof COLUMNS;
export type CellValue = string | number | boolean | Date | null | undefined;
export type Tab = {
  name: string;
  rows: CellValue[][];
  /** 1-based sheet row of rows[0] */ firstRow?: number;
};
export type Workbook = { tabs: Tab[] };
/** A single tab on its own (kept for callers that pass one table). */
export type SheetTable = { rows: CellValue[][]; firstRow?: number };

export const SYNC_STATUSES = ["NOT SYNCED", "SYNCED", "FAILED"] as const;

export type RegistryStudent = {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  program: string;
  educationLevel: string;
  passportId: string;
  firstIssued: string;
  studentStatus: string;
};

export type RegistryRow = RegistryStudent & {
  tab: string;
  sheetRow: number;
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
};

export type ParsedRow =
  | { ok: true; row: RegistryRow }
  | {
      ok: false;
      tab: string;
      sheetRow: number;
      recordId: string;
      studentId: string;
      errors: string[];
    };

export type ParsedWorkbook = {
  layout: "combined" | "registries";
  /** One entry per award record (Verified Skills rows, or combined rows). */
  rows: ParsedRow[];
  /** Students listed in a Students tab (registries layout) — each gets a passport. */
  students: {
    tab: string;
    sheetRow: number;
    student: RegistryStudent | null;
    studentId: string;
    errors: string[];
  }[];
  /** Header positions per tab, for writing results back. */
  columns: Record<string, Partial<Record<Column, number>>>;
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
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const dmy = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(s);
  const iso = ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * The workbook's test emails use @example.org. EMAIL_DOMAIN_REWRITE=example.org maps them to
 * the allowed BTU domain for demos; leave it empty in production.
 */
export function normalizeEmail(raw: string) {
  const email = raw.trim().toLowerCase();
  const from = process.env.EMAIL_DOMAIN_REWRITE?.trim().toLowerCase();
  if (from && email.endsWith(`@${from}`))
    return `${email.slice(0, -from.length)}${allowedEmailDomain()}`;
  return email;
}

const ID = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

type Record_ = {
  tab: string;
  sheetRow: number;
  raw: (c: Column) => CellValue;
  get: (c: Column) => string;
  has: (c: Column) => boolean;
};

/** Finds a tab's header row and turns its data rows into header-addressed records. */
function readTab(tab: Tab, mustHave: Column[]) {
  const first = tab.firstRow ?? 1;
  const headerIndex = tab.rows.findIndex((r) => {
    const cells = r.map((c) => norm(text(c)));
    return mustHave.every((col) => COLUMNS[col].some((a) => cells.includes(norm(a))));
  });
  if (headerIndex < 0) return null;
  const header = tab.rows[headerIndex]!.map((c) => norm(text(c)));
  const columns: Partial<Record<Column, number>> = {};
  for (const [key, aliases] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
    const i = header.findIndex((h) => aliases.some((a) => norm(a) === h));
    if (i >= 0) columns[key] = i;
  }
  const records: Record_[] = tab.rows.slice(headerIndex + 1).map((cells, offset) => {
    const raw = (c: Column) => (columns[c] === undefined ? undefined : cells[columns[c]!]);
    return {
      tab: tab.name,
      sheetRow: first + headerIndex + 1 + offset,
      raw,
      get: (c) => text(raw(c)),
      has: (c) => columns[c] !== undefined,
    };
  });
  return { columns, records };
}

const COMBINED: Column[] = ["studentId", "recordId", "skillName"];
const STUDENTS: Column[] = ["studentId", "firstName", "lastName"];
const CATALOG: Column[] = ["skillId", "skillName", "category"];
const AWARDS: Column[] = ["recordId", "studentId", "skillId"];

export function parseWorkbook(
  input: Workbook | SheetTable,
  preferredTab = process.env.GOOGLE_SHEETS_TAB || "Passport Skill Records",
): ParsedWorkbook {
  const workbook: Workbook = "tabs" in input ? input : { tabs: [{ name: preferredTab, ...input }] };
  const ordered = [...workbook.tabs].sort(
    (a, b) => Number(b.name === preferredTab) - Number(a.name === preferredTab),
  );

  for (const tab of ordered) {
    const combined = readTab(tab, COMBINED);
    if (combined) return parseCombined(combined);
  }

  const find = (must: Column[], not?: Column) => {
    for (const tab of workbook.tabs) {
      const read = readTab(tab, must);
      if (read && (!not || read.columns[not] === undefined)) return read;
    }
    return null;
  };
  const awards = find(AWARDS);
  const students = find(STUDENTS, "recordId");
  const catalog = find(CATALOG, "recordId");
  if (!awards || !students || !catalog) {
    throw new Error(
      'Could not recognise the registry. Expected either a "Passport Skill Records" sheet (Student ID, Record ID, Skill Name, …) ' +
        "or three tabs: Students, Skills Catalog and Verified Skills.",
    );
  }
  return parseRegistries(students, catalog, awards);
}

/** Student fields + the workbook's completeness rule. */
function studentFields(r: Record_, opts: { requireProfile: boolean }) {
  const errors: string[] = [];
  const studentId = r.get("studentId").toUpperCase();
  const required: Column[] = [
    "studentId",
    "firstName",
    "lastName",
    "email",
    ...(opts.requireProfile ? (["program", "educationLevel", "studentStatus"] as Column[]) : []),
  ];
  for (const c of required) if (!r.get(c)) errors.push(`${COLUMNS[c][0]} is empty`);
  if (studentId && !ID.test(studentId)) errors.push(`Student ID "${studentId}" is not valid`);
  const email = normalizeEmail(r.get("email"));
  if (email && !isAllowedEmail(email))
    errors.push(`Email must be an @${allowedEmailDomain()} address`);
  for (const c of ["firstName", "lastName"] as const)
    if (!isPrintable(r.get(c)))
      errors.push(`${COLUMNS[c][0]} has characters the passport cannot print`);
  const passportId = r.get("passportId").toUpperCase();
  if (passportId && !/^BTU-AI-\d{6}$/.test(passportId))
    errors.push(`Passport ID "${passportId}" is not valid`);
  const firstIssued = r.get("firstIssued") ? toIsoDate(r.raw("firstIssued")) : "";
  if (firstIssued === null)
    errors.push(`First Issued "${r.get("firstIssued")}" is not a valid date`);
  const student: RegistryStudent = {
    studentId,
    firstName: r.get("firstName").replace(/\s+/g, " "),
    lastName: r.get("lastName").replace(/\s+/g, " "),
    email,
    program: r.get("program"),
    educationLevel: r.get("educationLevel"),
    passportId,
    firstIssued: firstIssued || "",
    studentStatus: r.get("studentStatus") || "Active",
  };
  return { student, errors };
}

/** Skill + award fields. `skill` comes from the same row (combined) or the catalog (registries). */
function awardFields(r: Record_, skill: Record_) {
  const errors: string[] = [];
  const recordId = r.get("recordId").toUpperCase();
  const skillId = (r.get("skillId") || skill.get("skillId")).toUpperCase();
  for (const c of ["recordId", "dateEarned"] as const)
    if (!r.get(c)) errors.push(`${COLUMNS[c][0]} is empty`);
  for (const c of ["skillId", "skillName", "category", "description"] as const)
    if (!skill.get(c) && !(c === "skillId" && skillId)) errors.push(`${COLUMNS[c][0]} is empty`);
  if (recordId && !ID.test(recordId)) errors.push(`Record ID "${recordId}" is not valid`);
  if (skillId && !ID.test(skillId)) errors.push(`Skill ID "${skillId}" is not valid`);
  const category = skill.get("category");
  if (category && !isSkillCategory(category))
    errors.push(
      `Skill Category "${category}" must be one of: ${Object.keys(STAMP_CATEGORIES).join(", ")}`,
    );
  // Column N is calculated from the category; a different value means the row is inconsistent.
  const derivedBadge = isSkillCategory(category) ? STAMP_CATEGORIES[category].badgeCode : "";
  const badge = skill.get("badgeCode");
  if (badge && derivedBadge && badge !== derivedBadge)
    errors.push(`Badge/Stamp Code ${badge} does not match category (${derivedBadge})`);
  const dateEarned = toIsoDate(r.raw("dateEarned"));
  if (r.get("dateEarned") && !dateEarned)
    errors.push(`Date Earned "${r.get("dateEarned")}" is not a valid date`);
  for (const [c, src] of [
    ["skillName", skill],
    ["description", skill],
    ["earnedThrough", r],
  ] as const) {
    if (!isPrintable(src.get(c)))
      errors.push(`${COLUMNS[c][0]} has characters the passport cannot print`);
  }
  const syncStatus = r.get("syncStatus").toUpperCase();
  if (r.has("syncStatus")) {
    if (!syncStatus) errors.push("Passport Sync Status is empty (use NOT SYNCED for new records)");
    else if (!(SYNC_STATUSES as readonly string[]).includes(syncStatus))
      errors.push(`Passport Sync Status must be one of: ${SYNC_STATUSES.join(", ")}`);
  }
  return {
    errors,
    fields: {
      recordId,
      skillId,
      skillName: skill.get("skillName"),
      category: category as SkillCategory,
      badgeCode: derivedBadge,
      description: skill.get("description"),
      dateEarned: dateEarned ?? "",
      earnedThrough: r.get("earnedThrough"),
      verificationStatus: r.get("verificationStatus").toUpperCase(),
      syncStatus,
    },
  };
}

function parseCombined({
  columns,
  records,
}: NonNullable<ReturnType<typeof readTab>>): ParsedWorkbook {
  const rows: ParsedRow[] = [];
  for (const r of records) {
    const studentId = r.get("studentId").toUpperCase();
    const recordId = r.get("recordId").toUpperCase();
    // Skip blank rows and the workbook's notes section below the data.
    if (!recordId && !ID.test(studentId)) continue;
    const s = studentFields(r, { requireProfile: true });
    const a = awardFields(r, r);
    const errors = [...s.errors, ...a.errors];
    if (errors.length)
      rows.push({ ok: false, tab: r.tab, sheetRow: r.sheetRow, recordId, studentId, errors });
    else
      rows.push({ ok: true, row: { ...s.student, ...a.fields, tab: r.tab, sheetRow: r.sheetRow } });
  }
  return { layout: "combined", rows, students: [], columns: { [records[0]?.tab ?? ""]: columns } };
}

function parseRegistries(
  studentsTab: NonNullable<ReturnType<typeof readTab>>,
  catalogTab: NonNullable<ReturnType<typeof readTab>>,
  awardsTab: NonNullable<ReturnType<typeof readTab>>,
): ParsedWorkbook {
  const students: ParsedWorkbook["students"] = [];
  const studentById = new Map<string, RegistryStudent>();
  for (const r of studentsTab.records) {
    const studentId = r.get("studentId").toUpperCase();
    if (!ID.test(studentId) && !r.get("firstName")) continue;
    const { student, errors } = studentFields(r, { requireProfile: false });
    if (studentById.has(studentId)) errors.push(`Student ID ${studentId} is listed more than once`);
    students.push({
      tab: r.tab,
      sheetRow: r.sheetRow,
      studentId,
      student: errors.length ? null : student,
      errors,
    });
    if (!errors.length) studentById.set(studentId, student);
  }
  const catalog = new Map<string, Record_>();
  for (const r of catalogTab.records) {
    const id = r.get("skillId").toUpperCase();
    if (id) catalog.set(id, r);
  }

  const rows: ParsedRow[] = [];
  for (const r of awardsTab.records) {
    const studentId = r.get("studentId").toUpperCase();
    const recordId = r.get("recordId").toUpperCase();
    if (!recordId && !studentId) continue;
    const errors: string[] = [];
    const student = studentById.get(studentId);
    if (!student)
      errors.push(
        studentId
          ? `Student ID ${studentId} is not in the Students registry`
          : "Student ID is empty",
      );
    const skillId = r.get("skillId").toUpperCase();
    const skill = catalog.get(skillId);
    if (!skill)
      errors.push(
        skillId ? `Skill ID ${skillId} is not in the Skills Catalog` : "Skill ID is empty",
      );
    const a = skill ? awardFields(r, skill) : null;
    if (a) errors.push(...a.errors);
    if (errors.length || !student || !a)
      rows.push({ ok: false, tab: r.tab, sheetRow: r.sheetRow, recordId, studentId, errors });
    else
      rows.push({ ok: true, row: { ...student, ...a.fields, tab: r.tab, sheetRow: r.sheetRow } });
  }
  const tabName = (t: typeof studentsTab) => t.records[0]?.tab ?? "";
  return {
    layout: "registries",
    rows,
    students,
    columns: {
      [tabName(studentsTab)]: studentsTab.columns,
      [tabName(catalogTab)]: catalogTab.columns,
      [tabName(awardsTab)]: awardsTab.columns,
    },
  };
}

/** Fingerprint of a record's verified content; system-managed columns are excluded. */
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
