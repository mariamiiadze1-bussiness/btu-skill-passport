// @vitest-environment node
import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  addSkill,
  approveStudent,
  ForbiddenError,
  getAdminOverview,
  importExcel,
  rejectStudent,
} from "@/server/admin";
import { setAnchorProvider, type AnchorProvider } from "@/server/blockchain/anchoring";
import {
  AuthError,
  getSessionUser,
  login,
  logout,
  register,
  signInWithGoogle,
  startRegistration,
  type SessionUser,
} from "@/server/auth/accounts";
import {
  hashPassword,
  newVerificationCode,
  sha256Bytes,
  verifyPassword,
} from "@/server/core/crypto";
import type { Db } from "@/server/db/client";
import { isAllowedEmail } from "@/server/core/config";
import { checkIdTokenClaims, GoogleAuthError, parseOAuthCookie } from "@/server/auth/google";
import { anchorPending } from "@/server/passport/issuance";
import { buildMerkleTree, verifyMerkleProof } from "@/server/blockchain/merkle";
import { getPassportForStudent, officialPdf } from "@/server/passport/passports";
import { generatePassportPdf } from "@/server/pdf/generate";
import { RateLimitError } from "@/server/core/rate-limit";
import { configuredRegistrySource, syncFromSource, testWorkbookSource } from "@/server/registry";
import { runSync } from "@/server/registry/sync";
import * as schema from "@/server/db/schema";
import { TEST_SHEET_HEADER, TEST_SHEET_ROWS } from "@/server/db/seed-data";
import { seedDatabase } from "@/server/db/seed";
import { verifyPassportCode, verifyPdfHash } from "@/server/passport/verify";

const ADMIN = { email: "admin@btu.edu.ge", password: "admin-test-password-1" };
const STUDENT = { email: "btu-t-0001@btu.edu.ge", password: "student-test-pass" };

/** Both registration steps, using the code a non-production server returns. */
async function signUp(target: Db, input: Record<string, string>, key: string) {
  const { devCode } = await startRegistration(target, input, key);
  return register(target, { ...input, code: devCode }, key);
}
const INJECTIONS = [
  "' OR '1'='1",
  "admin@btu.edu.ge' --",
  "'; DROP TABLE users; --",
  '" OR 1=1 --',
  "BTU-' UNION SELECT * FROM users --",
];

/** In-memory stand-in for an EVM chain: same interface, instant blocks, can be made to fail. */
function fakeChain() {
  const txs = new Map<string, { from: string; root: string; block: number }>();
  const state = { failSubmit: false };
  const from = () => privateKeyToAccount(process.env.ISSUER_PRIVATE_KEY as `0x${string}`).address;
  const provider: AnchorProvider = {
    id: "evm:test",
    network: "Test chain",
    async submit(root) {
      if (state.failSubmit) throw new Error("RPC unavailable");
      const txHash = `0x${(txs.size + 1).toString(16).padStart(64, "0")}`;
      txs.set(txHash, { from: from(), root, block: 100 + txs.size });
      return { txHash };
    },
    status: async (h) =>
      txs.has(h) ? { state: "confirmed", blockNumber: txs.get(h)!.block } : { state: "pending" },
    read: async (h) =>
      txs.has(h)
        ? { from: txs.get(h)!.from, rootHex: txs.get(h)!.root, blockNumber: txs.get(h)!.block }
        : null,
    explorerUrl: (h) => `https://explorer.test/tx/${h}`,
    health: async () => ({ address: from(), balance: "1 ETH", ok: true }),
  };
  return { provider, txs, state };
}

let template: PGlite;
let db: Db;
let chain: ReturnType<typeof fakeChain>;
let seedTxCount = 0;

beforeAll(async () => {
  process.env.ISSUER_PRIVATE_KEY = generatePrivateKey();
  process.env.EMAIL_DOMAIN_REWRITE = "example.org";
  process.env.APP_URL = "https://passport.btu.test";
  chain = fakeChain();
  setAnchorProvider(chain.provider);
  template = new PGlite();
  const seedDb = drizzle(template, { schema }) as unknown as Db;
  await migrate(seedDb as never, { migrationsFolder: "drizzle" });
  await seedDatabase(seedDb, {
    adminEmail: ADMIN.email,
    adminPassword: ADMIN.password,
    studentPassword: STUDENT.password,
  });
  seedTxCount = chain.txs.size;
}, 120_000);

afterAll(() => setAnchorProvider(undefined));

beforeEach(async () => {
  chain.state.failSubmit = false;
  db = drizzle((await template.clone()) as PGlite, { schema }) as unknown as Db;
});

const sessionFor = async (c: { email: string; password: string }, ip = "1.1.1.1") =>
  getSessionUser(db, await login(db, c, ip));
const fullWorkbook = () => testWorkbookSource.read();
const passport = async (id: string) => (await getPassportForStudent(db, id))!;
type Header = (typeof TEST_SHEET_HEADER)[number];
/** The workbook with one extra data row appended. */
const withRow = (cells: string[]) => ({
  rows: [[...TEST_SHEET_HEADER], ...TEST_SHEET_ROWS, cells],
  firstRow: 3,
});
const EXTRA_ROW = 3 + TEST_SHEET_ROWS.length + 1;
/** A new award for Giorgi (BTU-T-0001), with overrides by column header. */
const giorgiRow = (over: Partial<Record<Header, string>> = {}) => {
  const base: Record<string, string> = Object.fromEntries(
    TEST_SHEET_HEADER.map((h, i) => [h, TEST_SHEET_ROWS[0]![i]!]),
  );
  Object.assign(
    base,
    {
      "Record ID": "REC-0900",
      "Skill ID": "SKL-013",
      "Skill Name": "Natural Language Processing",
      "Skill Category": "AI Advanced Skill",
      "Badge/Stamp Code": "BDG-AI-003",
      "Skill Description": "Applying natural language processing methods to textual data.",
      "Date Earned": "2026-10-20",
      "Passport Sync Status": "NOT SYNCED",
      "Synced Passport Version": "",
      "Synced At (UTC)": "",
    },
    over,
  );
  return TEST_SHEET_HEADER.map((h) => base[h] ?? "");
};
const newStudent = {
  "Student ID": "BTU-T-0099",
  "First Name": "Nika",
  "Last Name": "Gvaramia",
  "BTU Email (Test)": "btu-t-0099@example.org",
  "Passport ID (Existing)": "",
  "First Issued (Existing)": "",
} as const;

describe("seed from BTU's workbook (spec §1)", () => {
  it("gives all 18 students one passport with a permanent Passport ID and their SYNCED skills", async () => {
    expect((await db.select().from(schema.students)).length).toBe(18);
    const g = await passport("BTU-T-0001");
    expect(g.student).toMatchObject({
      firstName: "Giorgi",
      lastName: "Kapanadze",
      passportId: "BTU-AI-000125",
      originalIssueDate: "2026-09-15",
    });
    expect(g.versions).toHaveLength(1);
    expect(g.versions[0]!.skills.map((s) => s.name)).toEqual([
      "AI Literacy",
      "AI Workflow Automation",
    ]);
    expect(g.versions[0]).toMatchObject({
      version: 1,
      isCurrent: true,
      anchored: true,
      issuedAt: "2026-09-15",
    });
    // A student whose records are all NOT SYNCED still has an (empty) passport.
    expect((await passport("BTU-T-0003")).versions[0]!.skills).toHaveLength(0);
  });

  it("anchors all initial passports in a single blockchain transaction", async () => {
    expect(seedTxCount).toBe(1);
    const batches = await db.select().from(schema.anchorBatches);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ status: "confirmed" });
  });
});

describe("registry sync (spec §2, §4)", () => {
  it("adds new verified records and issues one updated version per student", async () => {
    const result = await runSync(db, await fullWorkbook(), { source: "test" });
    expect(result.totals).toMatchObject({ failed: 0, synced: 44, alreadySynced: 16 });
    const g = await passport("BTU-T-0001");
    expect(g.student).toMatchObject({
      passportId: "BTU-AI-000125",
      originalIssueDate: "2026-09-15",
    });
    expect(g.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(g.versions[0]!.isCurrent).toBe(true);
    expect(g.versions[0]!.skills.map((s) => s.id).sort()).toEqual([
      "REC-0001",
      "REC-0015",
      "REC-0029",
      "REC-0043",
    ]);
    expect(g.versions[0]!.added.sort()).toEqual([
      "AI Business Decision Support",
      "AI Data Analysis",
    ]);
    expect(g.versions[1]!.skills.map((s) => s.id)).toEqual(["REC-0001", "REC-0015"]);
  });

  it("is idempotent: syncing the same data again adds nothing", async () => {
    await runSync(db, await fullWorkbook(), { source: "test" });
    const before = (await db.select().from(schema.passportVersions)).length;
    const again = await runSync(db, await fullWorkbook(), { source: "test" });
    expect(again.totals).toMatchObject({ synced: 0, failed: 0, versions: 0, alreadySynced: 60 });
    expect((await db.select().from(schema.passportVersions)).length).toBe(before);
    expect(
      (await db.select().from(schema.skills).where(eq(schema.skills.studentId, "BTU-T-0001")))
        .length,
    ).toBe(4);
  });

  it("stops a record whose name does not match the Student ID, without touching that passport", async () => {
    const r = await runSync(
      db,
      withRow(giorgiRow({ "First Name": "Mariam", "Last Name": "Beridze" })),
      { source: "test" },
    );
    const row = r.outcomes.find((o) => o.recordId === "REC-0900")!;
    expect(row.status).toBe("failed");
    expect(row.message).toMatch(/does not match/);
    expect((await passport("BTU-T-0001")).versions[0]!.skills.map((s) => s.id)).not.toContain(
      "REC-0900",
    );
  });

  it("rejects incomplete and invalid rows", async () => {
    const cases: [Partial<Record<Header, string>>, RegExp][] = [
      [{ "Skill Name": "" }, /Skill Name is empty/],
      [{ "Skill Category": "AI Wizard" }, /Skill Category/],
      [{ "Date Earned": "31/31/2026" }, /Date Earned/],
      [{ "Student ID": "'; DROP TABLE students; --" }, /Student ID/],
      [{ "Badge/Stamp Code": "BDG-AI-001" }, /Badge\/Stamp Code/],
      [{ "Passport ID (Existing)": "BTU-AI-000126" }, /Passport ID/],
    ];
    for (const [over, message] of cases) {
      const r = await runSync(db, withRow(giorgiRow(over)), { source: "test" });
      const row = r.outcomes.find((o) => o.sheetRow === EXTRA_ROW)!;
      expect(row.status, JSON.stringify(over)).toBe("failed");
      expect(row.message).toMatch(message);
    }
    expect((await db.select().from(schema.students)).length).toBe(18);
  });

  it("never prints the same skill twice", async () => {
    const r = await runSync(
      db,
      withRow(
        giorgiRow({
          "Skill ID": "SKL-001",
          "Skill Name": "AI Literacy",
          "Skill Category": "AI Skill",
          "Badge/Stamp Code": "BDG-AI-001",
          "Skill Description": "Fundamentals of AI capabilities, limitations, and responsible use.",
        }),
      ),
      { source: "test" },
    );
    expect(r.outcomes.find((o) => o.recordId === "REC-0900")).toMatchObject({ status: "skipped" });
  });

  it("does not add awards that are not CONFIRMED", async () => {
    const rows = [
      [...TEST_SHEET_HEADER, "Verification Status"],
      ...TEST_SHEET_ROWS.map((r) => [...r, "CONFIRMED"]),
      [...giorgiRow(), "PENDING"],
    ];
    const r = await runSync(db, { rows, firstRow: 3 }, { source: "test" });
    expect(r.outcomes.find((o) => o.recordId === "REC-0900")).toMatchObject({ status: "skipped" });
    expect((await passport("BTU-T-0001")).versions[0]!.skills.map((s) => s.id)).not.toContain(
      "REC-0900",
    );
  });

  it("refuses edits to a record after it was issued", async () => {
    const edited = TEST_SHEET_ROWS.map((r) =>
      r[9] === "REC-0001" ? r.map((c, i) => (i === 15 ? "2026-01-01" : c)) : r,
    );
    const r = await runSync(
      db,
      { rows: [[...TEST_SHEET_HEADER], ...edited], firstRow: 3 },
      { source: "test" },
    );
    expect(r.outcomes.find((o) => o.recordId === "REC-0001")).toMatchObject({ status: "failed" });
  });

  it("creates a passport for a new student who appears in the sheet", async () => {
    const r = await runSync(db, withRow(giorgiRow(newStudent)), { source: "test" });
    expect(r.outcomes.find((o) => o.recordId === "REC-0900")).toMatchObject({
      status: "synced",
      passportId: "BTU-AI-000143",
    });
    expect((await passport("BTU-T-0099")).versions[0]).toMatchObject({
      version: 1,
      skills: [expect.objectContaining({ name: "Natural Language Processing" })],
    });
  });

  it("reads an Excel file on disk as the live registry (REGISTRY_EXCEL_PATH)", async () => {
    process.env["REGISTRY_EXCEL_PATH"] = "fixtures/btu-hackathon-test-data.xlsx";
    try {
      const source = configuredRegistrySource()!;
      expect(source.id).toBe("excel-file:btu-hackathon-test-data.xlsx");
      expect((await syncFromSource(db, source)).totals).toMatchObject({ synced: 44, failed: 0 });
      // Re-reading the unchanged file adds nothing.
      expect((await syncFromSource(db, source)).totals).toMatchObject({ synced: 0 });
    } finally {
      delete process.env["REGISTRY_EXCEL_PATH"];
    }
  });

  it("imports BTU's actual .xlsx file the same way", async () => {
    const admin = await sessionFor(ADMIN);
    const file = new File([readFileSync("fixtures/btu-hackathon-test-data.xlsx")], "test.xlsx");
    expect((await importExcel(db, admin, file)).totals).toMatchObject({
      synced: 44,
      failed: 0,
      alreadySynced: 16,
    });
  });
});

describe("blockchain verification (spec §5–§8)", () => {
  it("verifies a current version: record, issuer signature, Merkle proof and on-chain anchor", async () => {
    const code = (await passport("BTU-T-0001")).versions[0]!.verificationCode;
    const r = await verifyPassportCode(db, code, "v");
    expect(r).toMatchObject({
      valid: true,
      isCurrent: true,
      version: 1,
      holderInitials: "G. K.",
      passportIdMasked: "BTU-AI-000•••",
    });
    if (!r.valid) throw new Error("expected valid");
    expect(r.issuer).toMatchObject({ ok: true, did: "did:web:passport.btu.test" });
    expect(r.blockchain).toMatchObject({
      ok: true,
      state: "anchored",
      explorerUrl: expect.stringContaining("explorer.test"),
    });
    for (const secret of ["btu.edu.ge", "BTU-T-0001", "AI Literacy"])
      expect(JSON.stringify(r)).not.toContain(secret);
  });

  it("accepts the untouched PDF and rejects one changed by a single byte", async () => {
    const pdf = (await officialPdf(db, "BTU-T-0001", 1))!.pdf;
    const code = (await passport("BTU-T-0001")).versions[0]!.verificationCode;
    const ok = await verifyPassportCode(db, code, "f", sha256Bytes(pdf));
    expect(ok.valid && ok.file?.ok).toBe(true);
    const tampered = Uint8Array.from(pdf);
    tampered[tampered.length - 100]! ^= 1;
    const bad = await verifyPassportCode(db, code, "f", sha256Bytes(tampered));
    expect(bad.valid && bad.file?.ok).toBe(false);
    expect(await verifyPdfHash(db, sha256Bytes(tampered), "f")).toEqual({
      valid: false,
      reason: "not_found",
    });
    expect(await verifyPdfHash(db, sha256Bytes(pdf), "f")).toMatchObject({
      valid: true,
      version: 1,
    });
  });

  it("catches a PDF hash edited directly in the database", async () => {
    const code = (await passport("BTU-T-0001")).versions[0]!.verificationCode;
    const forged = sha256Bytes(new Uint8Array([1, 2, 3]));
    await db
      .update(schema.passportVersions)
      .set({ pdfSha256: forged })
      .where(eq(schema.passportVersions.verificationCode, code));
    const r = await verifyPassportCode(db, code, "t", forged);
    if (!r.valid) throw new Error("expected the record to be found");
    // The database alone would call the forged file a match; the signature and anchor don't.
    expect(r.file?.ok).toBe(true);
    expect(r.issuer.ok).toBe(false);
    expect(r.blockchain.ok).toBe(false);
  });

  it("marks an old version authentic but superseded", async () => {
    const v1 = (await passport("BTU-T-0001")).versions[0]!.verificationCode;
    await runSync(db, await fullWorkbook(), { source: "test" });
    expect(await verifyPassportCode(db, v1, "s")).toMatchObject({
      valid: true,
      isCurrent: false,
      version: 1,
      currentVersion: 2,
    });
  });

  it("fails the issuer check when the signing key is not BTU's", async () => {
    const code = (await passport("BTU-T-0001")).versions[0]!.verificationCode;
    const real = process.env.ISSUER_PRIVATE_KEY;
    process.env.ISSUER_PRIVATE_KEY = generatePrivateKey();
    try {
      const r = await verifyPassportCode(db, code, "i");
      expect(r.valid && r.issuer.ok).toBe(false);
    } finally {
      process.env.ISSUER_PRIVATE_KEY = real!;
    }
  });

  it("keeps the previous version current when anchoring fails, then recovers on retry", async () => {
    chain.state.failSubmit = true;
    const r = await runSync(db, await fullWorkbook(), { source: "test" });
    expect(r.anchorError).toMatch(/RPC/);
    expect(r.outcomes.find((o) => o.recordId === "REC-0029")).toMatchObject({ status: "pending" });
    const g = await passport("BTU-T-0001");
    expect(g.issuing).toBe(true);
    expect(g.versions.map((v) => v.version)).toEqual([1]);
    const [v2] = await db
      .select()
      .from(schema.passportVersions)
      .where(
        and(
          eq(schema.passportVersions.studentId, "BTU-T-0001"),
          eq(schema.passportVersions.version, 2),
        ),
      );
    expect(await verifyPassportCode(db, v2!.verificationCode, "p")).toEqual({
      valid: false,
      reason: "not_issued",
    });

    chain.state.failSubmit = false;
    await anchorPending(db);
    expect((await passport("BTU-T-0001")).versions[0]).toMatchObject({
      version: 2,
      isCurrent: true,
    });
  });

  it("explains that a Passport ID is not a verification code, and rejects junk", async () => {
    expect(await verifyPassportCode(db, "BTU-AI-000125", "x")).toEqual({
      valid: false,
      reason: "passport_id",
    });
    expect(await verifyPassportCode(db, newVerificationCode(), "x")).toEqual({
      valid: false,
      reason: "not_found",
    });
    for (const junk of [...INJECTIONS, "", "x".repeat(500), 42, null])
      expect(await verifyPassportCode(db, junk, `j${String(junk).length}`)).toMatchObject({
        valid: false,
      });
  });

  it("rate-limits guessing", async () => {
    for (let i = 0; i < 30; i++) await verifyPassportCode(db, newVerificationCode(), "brute");
    await expect(verifyPassportCode(db, newVerificationCode(), "brute")).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("builds Merkle proofs that verify only for their own leaf", () => {
    const leaves = Array.from({ length: 7 }, (_, i) => sha256Bytes(new Uint8Array([i])));
    const tree = buildMerkleTree(leaves);
    leaves.forEach((leaf, i) =>
      expect(verifyMerkleProof(leaf, tree.proof(i), tree.root)).toBe(true),
    );
    expect(verifyMerkleProof(leaves[0]!, tree.proof(1), tree.root)).toBe(false);
  });
});

describe("PDF generation (spec §3)", () => {
  const input = {
    firstName: "Giorgi",
    lastName: "Kapanadze",
    passportId: "BTU-AI-000125",
    firstIssuedOn: "2026-09-01",
    issuedOn: "2026-10-21",
    version: 2,
    verificationCode: "BTU-AAAA-BBBB-CCCC",
    verifyUrl: "https://x/verify",
    skills: [],
  };

  it("is byte-for-byte reproducible", async () => {
    expect(sha256Bytes(await generatePassportPdf(input))).toBe(
      sha256Bytes(await generatePassportPdf(input)),
    );
  });

  it("re-generates an issued version identically to its anchored hash", async () => {
    await expect(officialPdf(db, "BTU-T-0001", 1)).resolves.toMatchObject({
      filename: "BTU-AI-000125-v1.pdf",
    });
  });

  it("adds pages for many skills and fits very long names", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const skills = Array.from({ length: 12 }, (_, i) => ({
      name: `Skill ${i}`,
      category: "AI Skill",
      description: "d",
      dateEarned: "2026-10-01",
    }));
    const pdf = await generatePassportPdf({
      ...input,
      firstName: "Aleksandre-Konstantine",
      lastName: "Mchedlishvili-Tsereteli-Dadiani-Orbeliani",
      skills,
    });
    // cover + about + 2 card pages (10 + 2) + 3 table pages (5 + 5 + 2)
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(7);
  });
});

describe("sign in and registration (spec §9)", () => {
  it("hashes passwords with a random salt", async () => {
    const a = await hashPassword("correct horse");
    expect(a).not.toBe(await hashPassword("correct horse"));
    expect(await verifyPassword("correct horse", a)).toBe(true);
    expect(await verifyPassword("wrong horse", a)).toBe(false);
  });

  it("signs in against the database and refuses wrong passwords with one message", async () => {
    expect(await sessionFor(STUDENT)).toMatchObject({
      email: STUDENT.email,
      role: "student",
      studentId: "BTU-T-0001",
    });
    await expect(login(db, { ...STUDENT, password: "nope-nope" }, "ip")).rejects.toThrow(
      "Email or password is incorrect.",
    );
    await expect(login(db, { email: "nobody@btu.edu.ge", password: "x" }, "ip")).rejects.toThrow(
      "Email or password is incorrect.",
    );
  });

  it("only accepts @btu.edu.ge accounts", async () => {
    expect(isAllowedEmail("a@student.btu.edu.ge")).toBe(true);
    for (const bad of ["a@gmail.com", "a@evilbtu.edu.ge", "a@btu.edu.ge.evil.com"])
      expect(isAllowedEmail(bad)).toBe(false);
    await expect(login(db, { email: "someone@gmail.com", password: "x" }, "d")).rejects.toThrow(
      "@btu.edu.ge",
    );
  });

  it("is not fooled by SQL injection", async () => {
    for (const p of INJECTIONS) {
      await expect(login(db, { email: p, password: p }, `inj-${p}`)).rejects.toBeInstanceOf(
        AuthError,
      );
      await expect(
        login(db, { email: ADMIN.email, password: p }, `inj2-${p}`),
      ).rejects.toBeInstanceOf(AuthError);
    }
    expect((await db.select().from(schema.users)).length).toBeGreaterThan(1);
  });

  it("locks out repeated failures and rejects forged or logged-out sessions", async () => {
    for (let i = 0; i < 8; i++)
      await expect(login(db, { ...STUDENT, password: "bad" }, "9.9.9.9")).rejects.toBeInstanceOf(
        AuthError,
      );
    await expect(login(db, STUDENT, "9.9.9.9")).rejects.toBeInstanceOf(RateLimitError);
    expect(await getSessionUser(db, "' OR '1'='1")).toBeNull();
    const token = await login(db, STUDENT, "ip");
    await logout(db, token);
    expect(await getSessionUser(db, token)).toBeNull();
  });

  it("quick registration reserves a passport that BTU has not issued yet", async () => {
    const token = await signUp(
      db,
      {
        email: "nino.new@btu.edu.ge",
        password: "long-enough-pw",
        firstName: "Nino",
        lastName: "Chikovani-Dadeshkeliani",
      },
      "r",
    );
    const user = (await getSessionUser(db, token))!;
    const p = await passport(user.studentId!);
    expect(p.student).toMatchObject({
      firstName: "Nino",
      lastName: "Chikovani-Dadeshkeliani",
      passportId: "BTU-AI-000143",
    });
    // Not signed or anchored until BTU's data confirms the student (spec stage 1-3, section 6).
    expect(p.versions).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.passportVersions)
        .where(eq(schema.passportVersions.studentId, user.studentId!)),
    ).toHaveLength(0);
  });

  it("holds a self sign-up for approval: no skills until an administrator approves", async () => {
    const token = await signUp(
      db,
      { email: "wait@btu.edu.ge", password: "long-enough-pw", firstName: "Ana", lastName: "Wait" },
      "r",
    );
    const studentId = (await getSessionUser(db, token))!.studentId!;
    expect((await passport(studentId)).student).toMatchObject({ pendingApproval: true });
    const admin = (await sessionFor(ADMIN))!;
    const pending = (await getAdminOverview(db, admin)).students.filter((s) => s.pending);
    expect(pending.map((s) => s.email)).toEqual(["wait@btu.edu.ge"]);
    await expect(
      addSkill(db, admin, { studentId, catalogSkillId: "SKL-001", dateEarned: "2026-10-21" }),
    ).rejects.toThrow("Approve this student first");
    const student = (await sessionFor(STUDENT))!;
    await expect(approveStudent(db, student, studentId)).rejects.toBeInstanceOf(ForbiddenError);
    await approveStudent(db, admin, studentId);
    expect((await passport(studentId)).student).toMatchObject({ pendingApproval: false });
    await expect(approveStudent(db, admin, studentId)).rejects.toThrow("not waiting");
  });

  it("removes a rejected sign-up together with its account", async () => {
    const token = await signUp(
      db,
      { email: "nope@btu.edu.ge", password: "long-enough-pw", firstName: "No", lastName: "Pe" },
      "r",
    );
    const studentId = (await getSessionUser(db, token))!.studentId!;
    await rejectStudent(db, (await sessionFor(ADMIN))!, studentId);
    expect(await getSessionUser(db, token)).toBeNull();
    expect(
      await db.select().from(schema.students).where(eq(schema.students.id, studentId)),
    ).toHaveLength(0);
  });

  it("issues a reserved passport once an administrator confirms the student's first skill", async () => {
    const token = await signUp(
      db,
      {
        email: "reserved@btu.edu.ge",
        password: "long-enough-pw",
        firstName: "Ana",
        lastName: "Reserved",
      },
      "r",
    );
    const studentId = (await getSessionUser(db, token))!.studentId!;
    const admin = (await sessionFor(ADMIN))!;
    await approveStudent(db, admin, studentId);
    expect(
      (
        await addSkill(db, admin, {
          studentId,
          catalogSkillId: "SKL-001",
          dateEarned: "2026-10-21",
        })
      ).version,
    ).toBe(1);
    expect((await passport(studentId)).versions[0]).toMatchObject({
      version: 1,
      skills: [expect.objectContaining({ name: "AI Literacy" })],
    });
  });

  it("later matches a self-registered student to their BTU Student ID by email", async () => {
    const token = await signUp(
      db,
      {
        email: "btu-t-0099@btu.edu.ge",
        password: "long-enough-pw",
        firstName: "Nika",
        lastName: "Gvaramia",
      },
      "r",
    );
    const r = await runSync(db, withRow(giorgiRow(newStudent)), { source: "test" });
    expect(r.outcomes.find((o) => o.recordId === "REC-0900")).toMatchObject({
      status: "synced",
      version: 1,
    });
    expect((await getSessionUser(db, token))!.studentId).toBe("BTU-T-0099");
  });

  it("links a registry email to that student's existing passport", async () => {
    await db.delete(schema.users).where(eq(schema.users.email, "btu-t-0002@btu.edu.ge"));
    const user = (await getSessionUser(
      db,
      await signUp(db, { email: "BTU-T-0002@btu.edu.ge", password: "long-enough-pw" }, "r"),
    ))!;
    expect(user).toMatchObject({ role: "student", studentId: "BTU-T-0002" });
  });

  it("refuses duplicate accounts and names the passport cannot print", async () => {
    await expect(
      signUp(db, { email: STUDENT.email, password: "long-enough-pw" }, "r"),
    ).rejects.toThrow("already exists");
    await expect(
      signUp(
        db,
        { email: "x@btu.edu.ge", password: "long-enough-pw", firstName: "ნინო", lastName: "B" },
        "r",
      ),
    ).rejects.toThrow("Latin");
  });
});

describe("sign-up email codes", () => {
  const input = { email: "btu-t-0002@btu.edu.ge", password: "long-enough-pw" };
  beforeEach(() => db.delete(schema.users).where(eq(schema.users.email, input.email)));

  it("creates no account until the emailed code is confirmed", async () => {
    await expect(register(db, input, "c")).rejects.toThrow("6-digit");
    await expect(register(db, { ...input, code: "000000" }, "c")).rejects.toThrow("expired");
    const { devCode } = await startRegistration(db, input, "c");
    expect(devCode).toMatch(/^\d{6}$/);
    expect(
      await db.select().from(schema.users).where(eq(schema.users.email, input.email)),
    ).toHaveLength(0);
    const user = await getSessionUser(db, await register(db, { ...input, code: devCode! }, "c"));
    expect(user).toMatchObject({ studentId: "BTU-T-0002" });
  });

  it("burns the code after five wrong guesses", async () => {
    const { devCode } = await startRegistration(db, input, "g");
    const wrong = devCode === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++)
      await expect(register(db, { ...input, code: wrong }, `g${i}`)).rejects.toThrow("not correct");
    await expect(register(db, { ...input, code: devCode! }, "g9")).rejects.toThrow("expired");
  });
});

describe("hosted testing without a mail service (ALLOW_UNVERIFIED_SIGNUP)", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env["NODE_ENV"] = "production";
  });
  afterEach(() => {
    process.env["NODE_ENV"] = env["NODE_ENV"] ?? "test";
    delete process.env["ALLOW_UNVERIFIED_SIGNUP"];
  });
  const input = {
    email: "new.person@btu.edu.ge",
    password: "long-enough-pw",
    firstName: "New",
    lastName: "Person",
  };

  it("is closed by default when no email can be delivered", async () => {
    await expect(startRegistration(db, input, "u")).rejects.toThrow("not available");
  });

  it("when switched on, creates a pending, unverified account without a code step", async () => {
    process.env["ALLOW_UNVERIFIED_SIGNUP"] = "true";
    const sent = await startRegistration(db, input, "u");
    expect(sent.autoConfirm).toBe(true);
    const user = (await getSessionUser(
      db,
      await register(db, { ...input, code: sent.devCode }, "u"),
    ))!;
    expect((await passport(user.studentId!)).student).toMatchObject({ pendingApproval: true });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row!.emailVerifiedAt).toBeNull();
  });

  it("never lets an unverified sign-up claim a student from BTU's registry", async () => {
    process.env["ALLOW_UNVERIFIED_SIGNUP"] = "true";
    await db.delete(schema.users).where(eq(schema.users.email, "btu-t-0002@btu.edu.ge"));
    await expect(
      startRegistration(db, { email: "btu-t-0002@btu.edu.ge", password: "long-enough-pw" }, "u"),
    ).rejects.toThrow("belongs to a student");
  });
});

describe("Google sign-in", () => {
  const claims = (extra: Record<string, unknown>) => ({
    sub: "g-123",
    email: "btu-t-0002@btu.edu.ge",
    email_verified: true,
    hd: "btu.edu.ge",
    nonce: "n1",
    given_name: "Mariam",
    family_name: "Beridze",
    ...extra,
  });
  const code = (fn: () => unknown) => {
    try {
      fn();
      return "passed";
    } catch (e) {
      return e instanceof GoogleAuthError ? e.code : "other";
    }
  };

  it("accepts only verified BTU Workspace accounts", () => {
    expect(checkIdTokenClaims(claims({}), "n1")).toMatchObject({
      sub: "g-123",
      email: "btu-t-0002@btu.edu.ge",
      firstName: "Mariam",
    });
    expect(code(() => checkIdTokenClaims(claims({}), "other"))).toBe("state");
    expect(code(() => checkIdTokenClaims(claims({ email_verified: false }), "n1"))).toBe(
      "unverified",
    );
    expect(
      code(() => checkIdTokenClaims(claims({ email: "x@gmail.com", hd: undefined }), "n1")),
    ).toBe("domain");
    expect(parseOAuthCookie("not json")).toBeNull();
  });

  it("links existing accounts and marks the email verified", async () => {
    expect(
      (await getSessionUser(db, await signInWithGoogle(db, { sub: "g-1", email: STUDENT.email })))
        ?.studentId,
    ).toBe("BTU-T-0001");
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, STUDENT.email));
    expect(row!.emailVerifiedAt).not.toBeNull();
    await expect(signInWithGoogle(db, { sub: "g-other", email: STUDENT.email })).rejects.toThrow(
      "different Google account",
    );
  });

  it("creates a passport for a new BTU Google account from its profile name", async () => {
    const user = (await getSessionUser(
      db,
      await signInWithGoogle(db, {
        sub: "g-new",
        email: "luka.new@btu.edu.ge",
        firstName: "Luka",
        lastName: "Natroshvili",
      }),
    ))!;
    expect((await passport(user.studentId!)).student).toMatchObject({
      firstName: "Luka",
      lastName: "Natroshvili",
    });
  });
});

describe("admin panel", () => {
  let admin: SessionUser;
  let student: SessionUser;
  beforeEach(async () => {
    admin = (await sessionFor(ADMIN))!;
    student = (await sessionFor(STUDENT, "2.2.2.2"))!;
  });

  it("blocks anonymous users and students from every admin action", async () => {
    for (const user of [null, student]) {
      await expect(getAdminOverview(db, user)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        addSkill(db, user, {
          studentId: "BTU-T-0001",
          catalogSkillId: "SKL-001",
          dateEarned: "2026-10-01",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(importExcel(db, user, null)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("adds a skill by hand and issues the next version immediately", async () => {
    const r = await addSkill(db, admin, {
      studentId: "BTU-T-0003",
      name: "AI Agents",
      category: "AI Applied Skill",
      description: "Built and tested a simple AI agent.",
      dateEarned: "2026-10-20",
      earnedThrough: "Build Your First AI Agent Challenge",
    });
    expect(r.version).toBe(2);
    expect((await passport("BTU-T-0003")).versions[0]!.skills[0]).toMatchObject({
      name: "AI Agents",
      earnedThrough: "Build Your First AI Agent Challenge",
    });
    const [award] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.studentId, "BTU-T-0003"));
    await expect(
      addSkill(db, admin, {
        studentId: "BTU-T-0003",
        catalogSkillId: award!.catalogSkillId!,
        dateEarned: "2026-10-21",
      }),
    ).rejects.toThrow("already on this passport");
  });

  it("rejects injected input", async () => {
    for (const p of INJECTIONS) {
      await expect(
        addSkill(db, admin, { studentId: p, catalogSkillId: "SKL-001", dateEarned: "2026-10-01" }),
      ).rejects.toThrow();
    }
    expect((await db.select().from(schema.students)).length).toBe(18);
  });

  it("shows sync errors, blockchain batches and the issuer identity", async () => {
    await runSync(db, withRow(giorgiRow({ "First Name": "Wrong" })), { source: "test" });
    const o = await getAdminOverview(db, admin);
    expect(o.registry.failed[0]).toMatchObject({ recordId: "REC-0900" });
    expect(o.blockchain).toMatchObject({ enabled: true, network: "Test chain", funded: true });
    expect(o.blockchain.batches.length).toBeGreaterThan(0);
  });
});

describe("student notifications", () => {
  it("tells the student which skills a new version added", async () => {
    const { unreadNotifications, markNotificationsRead } =
      await import("@/server/core/notifications");
    await runSync(db, await fullWorkbook(), { source: "test" });
    const notes = await unreadNotifications(db, "BTU-T-0001");
    expect(notes[0]).toMatchObject({ title: "Your passport was updated to v2" });
    expect(notes[0]!.body).toContain("AI Data Analysis");
    await markNotificationsRead(db, "BTU-T-0001");
    expect(await unreadNotifications(db, "BTU-T-0001")).toHaveLength(0);
  });
});

describe("registry layouts and the workbook's rules", () => {
  /** BTU's test data rearranged into the brief's three registries (Students, Skills Catalog, Verified Skills). */
  function threeTabWorkbook(extraAwards: string[][] = [], extraStudents: string[][] = []) {
    const col = (h: Header) => TEST_SHEET_HEADER.indexOf(h);
    const studentRows = new Map<string, string[]>();
    const catalog = new Map<string, string[]>();
    for (const r of TEST_SHEET_ROWS) {
      studentRows.set(r[col("Student ID")]!, [
        r[col("Student ID")]!,
        r[col("First Name")]!,
        r[col("Last Name")]!,
        r[col("BTU Email (Test)")]!,
        r[col("Passport ID (Existing)")]!,
        r[col("First Issued (Existing)")]!,
      ]);
      catalog.set(r[col("Skill ID")]!, [
        r[col("Skill ID")]!,
        r[col("Skill Name")]!,
        r[col("Skill Category")]!,
        r[col("Skill Description")]!,
      ]);
    }
    return {
      tabs: [
        {
          name: "Students",
          rows: [
            ["Student ID", "First Name", "Last Name", "BTU Email", "Passport ID", "First Issued"],
            ...studentRows.values(),
            ...extraStudents,
          ],
        },
        {
          name: "Skills Catalog",
          rows: [
            ["Skill ID", "Skill Name", "Skill Category", "Skill Description"],
            ...catalog.values(),
          ],
        },
        {
          name: "Verified Skills",
          rows: [
            ["Record ID", "Student ID", "Skill ID", "Date Earned", "Status"],
            ...TEST_SHEET_ROWS.map((r) => [
              r[col("Record ID")]!,
              r[col("Student ID")]!,
              r[col("Skill ID")]!,
              r[col("Date Earned")]!,
              "CONFIRMED",
            ]),
            ...extraAwards,
          ],
        },
      ],
    };
  }

  it("syncs the three-registry layout exactly like the combined sheet", async () => {
    const r = await runSync(db, threeTabWorkbook(), { source: "test" });
    expect(r.totals).toMatchObject({ synced: 44, alreadySynced: 16, failed: 0 });
    expect((await passport("BTU-T-0001")).versions[0]!.skills).toHaveLength(4);
  });

  it("stops awards for unknown students or skills, and ignores PENDING / REJECTED", async () => {
    const r = await runSync(
      db,
      threeTabWorkbook([
        ["REC-0901", "BTU-T-0777", "SKL-001", "2026-10-20", "CONFIRMED"],
        ["REC-0902", "BTU-T-0001", "SKL-999", "2026-10-20", "CONFIRMED"],
        ["REC-0903", "BTU-T-0001", "SKL-013", "2026-10-20", "PENDING"],
        ["REC-0904", "BTU-T-0001", "SKL-012", "2026-10-20", "REJECTED"],
      ]),
      { source: "test" },
    );
    const by = (id: string) => r.outcomes.find((o) => o.recordId === id)!;
    expect(by("REC-0901")).toMatchObject({
      status: "failed",
      message: expect.stringContaining("not in the Students registry"),
    });
    expect(by("REC-0902")).toMatchObject({
      status: "failed",
      message: expect.stringContaining("not in the Skills Catalog"),
    });
    expect(by("REC-0903")).toMatchObject({ status: "skipped" });
    expect(by("REC-0904")).toMatchObject({ status: "skipped" });
    const ids = (await passport("BTU-T-0001")).versions[0]!.skills.map((s) => s.id);
    for (const id of ["REC-0901", "REC-0902", "REC-0903", "REC-0904"])
      expect(ids).not.toContain(id);
  });

  it("adds a record once BTU changes its status from PENDING to CONFIRMED", async () => {
    const award = (status: string) => [["REC-0905", "BTU-T-0001", "SKL-013", "2026-10-20", status]];
    const first = await runSync(db, threeTabWorkbook(award("PENDING")), { source: "test" });
    expect(first.outcomes.find((o) => o.recordId === "REC-0905")).toMatchObject({
      status: "skipped",
    });
    const second = await runSync(db, threeTabWorkbook(award("CONFIRMED")), { source: "test" });
    expect(second.outcomes.find((o) => o.recordId === "REC-0905")).toMatchObject({
      status: "synced",
      version: 3,
    });
    expect((await passport("BTU-T-0001")).versions[0]!.added).toEqual([
      "Natural Language Processing",
    ]);
  });

  it("issues a passport to a new student in the Students registry even before any skill", async () => {
    const r = await runSync(
      db,
      threeTabWorkbook([], [["BTU-T-0500", "Tekla", "Abesadze", "btu-t-0500@example.org", "", ""]]),
      {
        source: "test",
      },
    );
    expect(r.passportIds["BTU-T-0500"]).toBe("BTU-AI-000143");
    expect((await passport("BTU-T-0500")).versions[0]).toMatchObject({ version: 1, skills: [] });
  });

  it("enforces the completeness rule (A-M and O-Q populated)", async () => {
    const cases: [Partial<Record<Header, string>>, RegExp][] = [
      [{ Program: "" }, /Program is empty/],
      [{ "Student Status": "" }, /Student Status is empty/],
      [{ "Passport Sync Status": "" }, /Passport Sync Status is empty/],
      [{ "Passport Sync Status": "DONE" }, /Passport Sync Status must be/],
    ];
    for (const [over, message] of cases) {
      const r = await runSync(db, withRow(giorgiRow(over)), { source: "test" });
      expect(r.outcomes.find((o) => o.sheetRow === EXTRA_ROW)).toMatchObject({
        status: "failed",
        message: expect.stringMatching(message),
      });
    }
  });

  it("writes the new Passport ID back to every row of a new student, and Q-T for each record", async () => {
    const { writeBackCells } = await import("@/server/registry");
    const literacy = {
      "Skill ID": "SKL-001",
      "Skill Name": "AI Literacy",
      "Skill Category": "AI Skill",
      "Badge/Stamp Code": "BDG-AI-001",
      "Skill Description": "Fundamentals of AI capabilities, limitations, and responsible use.",
    } as const;
    const rows = [
      giorgiRow({ ...newStudent, "Record ID": "REC-0910" }),
      giorgiRow({ ...newStudent, ...literacy, "Record ID": "REC-0911" }),
      giorgiRow({ ...newStudent, "Record ID": "REC-0912", "Skill Category": "Wrong" }),
    ];
    const workbook = {
      tabs: [
        { name: "Passport Skill Records", rows: [[...TEST_SHEET_HEADER], ...rows], firstRow: 3 },
      ],
    };
    const result = await runSync(db, workbook, { source: "test" });
    const cells = writeBackCells(workbook, result);
    const at = (h: Header) => TEST_SHEET_HEADER.indexOf(h);
    // All three rows, including the failed one, get the same permanent Passport ID.
    expect(
      cells.filter((c) => c.col === at("Passport ID (Existing)")).map((c) => [c.row, c.value]),
    ).toEqual([
      [4, "BTU-AI-000143"],
      [5, "BTU-AI-000143"],
      [6, "BTU-AI-000143"],
    ]);
    const value = (row: number, h: Header) =>
      cells.find((c) => c.row === row && c.col === at(h))?.value;
    expect([4, 5, 6].map((row) => value(row, "Passport Sync Status"))).toEqual([
      "SYNCED",
      "SYNCED",
      "FAILED",
    ]);
    expect(value(4, "Synced Passport Version")).toBe("V1");
    expect(value(6, "Sync Error / Notes")).toMatch(/Skill Category/);
  });
});
