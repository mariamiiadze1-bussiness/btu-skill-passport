import { eq } from "drizzle-orm";

import { getAnchorProvider } from "./anchoring";
import { maskCode, normalizeVerificationCode, PASSPORT_ID_PATTERN } from "./crypto";
import type { Db } from "./db";
import { OFFICIAL } from "./issuance";
import { didDocumentUrl, issuerAddress, issuerDid, ISSUER_NAME, recoverLeafSigner } from "./issuer";
import { verifyMerkleProof } from "./merkle";
import { enforceRateLimit } from "./rate-limit";
import { anchorBatches, passportVersions, students, verificationChecks } from "./schema";

type Check = { ok: boolean; detail: string };

export type VerificationResult =
  | { valid: false; reason: "invalid_format" | "passport_id" | "not_found" | "not_issued" }
  | {
      valid: true;
      code: string;
      version: number;
      issuedAt: string;
      isCurrent: boolean;
      currentVersion: number;
      skillCount: number;
      holderInitials: string;
      passportIdMasked: string;
      documentHash: string;
      issuer: Check & { name: string; did: string; didDocument: string; address: string | null };
      blockchain: Check & {
        state: "anchored" | "not_configured";
        network: string | null;
        txHash: string | null;
        explorerUrl: string | null;
        blockNumber: number | null;
        merkleRoot: string | null;
      };
      /** Set when a PDF file was checked. */
      file?: Check | undefined;
    };

/**
 * Public lookup by verification code (no sign-in). Only what is needed to confirm
 * authenticity is returned — never the student's email, Student ID or skill details.
 * `fileSha256` (hashed in the browser, so the PDF itself is never uploaded) checks the file.
 */
export async function verifyPassportCode(
  db: Db,
  raw: unknown,
  clientKey: string,
  fileSha256?: unknown,
): Promise<VerificationResult> {
  await enforceRateLimit(db, `verify:${clientKey}`, 30, 60);
  const input = typeof raw === "string" && raw.length <= 64 ? raw.trim() : "";
  const code = normalizeVerificationCode(input);
  if (!code) {
    await db.insert(verificationChecks).values({ codeMasked: "invalid", result: "invalid" });
    return {
      valid: false,
      reason: PASSPORT_ID_PATTERN.test(input) ? "passport_id" : "invalid_format",
    };
  }

  const [row] = await db
    .select({ v: passportVersions, s: students, b: anchorBatches })
    .from(passportVersions)
    .innerJoin(students, eq(students.id, passportVersions.studentId))
    .leftJoin(anchorBatches, eq(anchorBatches.id, passportVersions.anchorBatchId))
    .where(eq(passportVersions.verificationCode, code));
  if (!row) {
    await db.insert(verificationChecks).values({ codeMasked: maskCode(code), result: "not_found" });
    return { valid: false, reason: "not_found" };
  }
  if (!(OFFICIAL as readonly string[]).includes(row.v.anchorStatus)) {
    await db
      .insert(verificationChecks)
      .values({ codeMasked: maskCode(code), passportVersionId: row.v.id, result: "not_issued" });
    return { valid: false, reason: "not_issued" };
  }

  const currentVersion = await latestOfficial(db, row.s.id, row.v.version);
  const isCurrent = row.v.version === currentVersion;

  // Issuer authenticity: the signature must recover to the key BTU publishes in its DID document.
  const expected = issuerAddress();
  const signer = await recoverLeafSigner(row.v.merkleLeaf, row.v.issuerSignature);
  const issuerOk = !!expected && !!signer && signer.toLowerCase() === expected.toLowerCase();

  // Document authenticity on-chain: leaf → Merkle proof → root → transaction sent by the issuer.
  let blockchain: Extract<VerificationResult, { valid: true }>["blockchain"];
  if (row.v.anchorStatus === "unanchored" || !row.b) {
    blockchain = {
      ok: false,
      state: "not_configured",
      detail: "This server has no blockchain configured (development mode).",
      network: null,
      txHash: null,
      explorerUrl: null,
      blockNumber: null,
      merkleRoot: null,
    };
  } else {
    const proofOk = verifyMerkleProof(row.v.merkleLeaf, row.v.merkleProof ?? [], row.b.merkleRoot);
    const provider = safeProvider();
    const onChain = provider && row.b.txHash ? await provider.read(row.b.txHash) : null;
    const chainOk =
      !!onChain &&
      onChain.rootHex === row.b.merkleRoot &&
      !!expected &&
      onChain.from.toLowerCase() === expected.toLowerCase();
    blockchain = {
      ok: proofOk && chainOk,
      state: "anchored",
      detail: !proofOk
        ? "The Merkle proof does not match the anchored root."
        : !onChain
          ? "Could not reach the blockchain right now; try again shortly."
          : chainOk
            ? `Anchored by BTU's issuer address in block ${onChain.blockNumber ?? row.b.blockNumber}.`
            : "The on-chain record does not match this document.",
      network: row.b.network,
      txHash: row.b.txHash,
      explorerUrl: provider && row.b.txHash ? provider.explorerUrl(row.b.txHash) : null,
      blockNumber: onChain?.blockNumber ?? row.b.blockNumber,
      merkleRoot: row.b.merkleRoot,
    };
  }

  let file: Check | undefined;
  if (typeof fileSha256 === "string" && /^[a-f0-9]{64}$/i.test(fileSha256)) {
    const match = fileSha256.toLowerCase() === row.v.pdfSha256;
    file = {
      ok: match,
      detail: match
        ? `The uploaded PDF is byte-for-byte identical to official version v${row.v.version}.`
        : "The uploaded PDF does NOT match this official version: it was modified or is a different document.",
    };
  }

  await db.insert(verificationChecks).values({
    codeMasked: maskCode(code),
    passportVersionId: row.v.id,
    result: file
      ? file.ok
        ? "file_match"
        : "file_mismatch"
      : isCurrent
        ? "current"
        : "superseded",
  });

  return {
    valid: true,
    code,
    version: row.v.version,
    issuedAt: row.v.issuedOn,
    isCurrent,
    currentVersion,
    skillCount: row.v.skillIds.length,
    holderInitials: `${row.s.firstName[0] ?? ""}. ${row.s.lastName}`,
    passportIdMasked: `${row.s.passportId.slice(0, -3)}•••`,
    documentHash: `sha256:${row.v.pdfSha256.slice(0, 16)}…`,
    issuer: {
      ok: issuerOk,
      detail: issuerOk
        ? `Signed by ${ISSUER_NAME}'s published issuer key.`
        : "The issuer signature could not be confirmed.",
      name: ISSUER_NAME,
      did: issuerDid(),
      didDocument: didDocumentUrl(),
      address: expected,
    },
    blockchain,
    file,
  };
}

/** Looks up a version by the PDF's hash alone (when someone only has the file). */
export async function verifyPdfHash(
  db: Db,
  fileSha256: unknown,
  clientKey: string,
): Promise<VerificationResult> {
  await enforceRateLimit(db, `verify:${clientKey}`, 30, 60);
  if (typeof fileSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(fileSha256))
    return { valid: false, reason: "invalid_format" };
  const [row] = await db
    .select({ code: passportVersions.verificationCode })
    .from(passportVersions)
    .where(eq(passportVersions.pdfSha256, fileSha256.toLowerCase()));
  if (!row) {
    await db.insert(verificationChecks).values({ codeMasked: "file", result: "file_mismatch" });
    return { valid: false, reason: "not_found" };
  }
  return verifyPassportCode(db, row.code, `${clientKey}:file`, fileSha256);
}

async function latestOfficial(db: Db, studentId: string, fallback: number) {
  const rows = await db
    .select({ version: passportVersions.version, status: passportVersions.anchorStatus })
    .from(passportVersions)
    .where(eq(passportVersions.studentId, studentId));
  const official = rows
    .filter((r) => (OFFICIAL as readonly string[]).includes(r.status))
    .map((r) => r.version);
  return official.length ? Math.max(...official) : fallback;
}

function safeProvider() {
  try {
    return getAnchorProvider();
  } catch {
    return null;
  }
}
