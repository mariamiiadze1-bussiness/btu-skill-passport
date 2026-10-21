import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Every reference to a student follows renames, so a self-registered student can later be matched to their BTU Student ID. */
const studentRef = { onDelete: "cascade", onUpdate: "cascade" } as const;

export const students = pgTable("students", {
  /** BTU Student ID (e.g. BTU-T-0001), or BTU-S-… for a self-registered student not yet in the registry. */
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  program: text("program").notNull().default(""),
  educationLevel: text("education_level").notNull().default(""),
  /** Permanent Passport ID; never changes once issued. */
  passportId: text("passport_id").notNull().unique(),
  /** First issue date; fixed at creation. */
  issuedAt: date("issued_at", { mode: "string" }).notNull(),
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    // Null for accounts that only ever sign in with Google.
    passwordHash: text("password_hash"),
    googleSub: text("google_sub").unique(),
    /** Set when ownership of the mailbox is proven (Google sign-in today; email codes later). */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    role: text("role", { enum: ["student", "admin"] }).notNull(),
    studentId: text("student_id").references(() => students.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("users_role_check", sql`${t.role} in ('student', 'admin')`)],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token; the raw token never touches the database.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Skills Catalog: one definition per Skill ID (SKL-…). */
export const skillCatalog = pgTable("skill_catalog", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  badgeCode: text("badge_code").notNull(),
  description: text("description").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Awarded skills. `id` is the registry's Record ID (REC-…): one award event, processed once. */
export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, studentRef),
    catalogSkillId: text("catalog_skill_id").references(() => skillCatalog.id),
    name: text("name").notNull(),
    category: text("category").notNull(),
    badgeCode: text("badge_code").notNull(),
    description: text("description").notNull(),
    dateEarned: date("date_earned", { mode: "string" }).notNull(),
    earnedThrough: text("earned_through").notNull().default(""),
    source: text("source").notNull().default(""),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("skills_student_idx").on(t.studentId),
    check("skills_status_check", sql`${t.status} in ('pending', 'approved', 'rejected')`),
  ],
);

/** One Merkle root published on a blockchain for a batch of issued versions. */
export const anchorBatches = pgTable("anchor_batches", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  network: text("network").notNull(),
  merkleRoot: text("merkle_root").notNull(),
  txHash: text("tx_hash"),
  blockNumber: integer("block_number"),
  status: text("status", { enum: ["submitted", "confirmed", "failed"] }).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const passportVersions = pgTable(
  "passport_versions",
  {
    id: serial("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, studentRef),
    version: integer("version").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    /** Date printed on this version (YYYY-MM-DD); part of the reproducible PDF input. */
    issuedOn: date("issued_on", { mode: "string" }).notNull(),
    /** Per-version public code (differs from the permanent Passport ID). */
    verificationCode: text("verification_code").notNull().unique(),
    // Snapshot of the skills printed on this version, so later edits never change an issued document.
    skillIds: text("skill_ids").array().notNull(),
    verifyUrl: text("verify_url").notNull(),
    /** SHA-256 of the exact PDF bytes. */
    pdfSha256: text("pdf_sha256").notNull(),
    merkleLeaf: text("merkle_leaf").notNull(),
    /** BTU issuer's EIP-191 signature over the leaf. */
    issuerSignature: text("issuer_signature").notNull(),
    /**
     * pending → submitted → anchored. Only anchored versions (or "unanchored" when no
     * blockchain is configured) count as officially issued and can become the latest version.
     */
    anchorStatus: text("anchor_status", {
      enum: ["pending", "submitted", "anchored", "unanchored"],
    }).notNull(),
    anchorBatchId: integer("anchor_batch_id").references(() => anchorBatches.id),
    merkleProof: text("merkle_proof").array(),
  },
  (t) => [
    uniqueIndex("passport_versions_student_version_idx").on(t.studentId, t.version),
    index("passport_versions_pdf_idx").on(t.pdfSha256),
    index("passport_versions_anchor_idx").on(t.anchorStatus),
  ],
);

/** One sync of the skill registry (Google Sheets, Excel upload, seed). */
export const importRuns = pgTable("import_runs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull(),
  totals: jsonb("totals").$type<{
    rows: number;
    synced: number;
    alreadySynced: number;
    skipped: number;
    failed: number;
    versions: number;
  }>(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/** Per-Record-ID processing ledger: makes imports idempotent and records every error. */
export const importRecords = pgTable(
  "import_records",
  {
    recordId: text("record_id").primaryKey(),
    runId: integer("run_id").references(() => importRuns.id, { onDelete: "set null" }),
    studentId: text("student_id"),
    sheetRow: integer("sheet_row"),
    status: text("status", { enum: ["synced", "skipped", "failed"] }).notNull(),
    version: integer("version"),
    message: text("message"),
    /** Hash of the row's verified fields, to detect edits after a record was issued. */
    rowHash: text("row_hash"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_records_status_idx").on(t.status)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    studentId: text("student_id").references(() => students.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    version: integer("version"),
    status: text("status", { enum: ["completed", "processing", "pending", "failed"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt)],
);

export const verificationChecks = pgTable(
  "verification_checks",
  {
    id: serial("id").primaryKey(),
    // Only a masked form of the submitted code is kept.
    codeMasked: text("code_masked").notNull(),
    passportVersionId: integer("passport_version_id").references(() => passportVersions.id, {
      onDelete: "set null",
    }),
    result: text("result", {
      enum: [
        "current",
        "superseded",
        "not_issued",
        "not_found",
        "invalid",
        "file_match",
        "file_mismatch",
      ],
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_created_idx").on(t.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

/** Short-lived named locks so two syncs (webhook + cron + button) never run at once. */
export const locks = pgTable("locks", {
  name: text("name").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Messages to a student, e.g. "Your passport was updated to v2". Also emailed via mail.ts. */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, studentRef),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("notifications_student_idx").on(t.studentId)],
);
