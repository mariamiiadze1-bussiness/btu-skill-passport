import { createHash } from "node:crypto";

/**
 * Sorted-pair SHA-256 Merkle tree. One blockchain transaction anchors the root of a whole
 * batch of passport versions; each version keeps a short proof (log2 n hashes) that links its
 * leaf to that root. Sorting each pair means a proof needs no left/right flags.
 */

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest();

function parent(a: Buffer, b: Buffer) {
  return sha256(Buffer.compare(a, b) <= 0 ? Buffer.concat([a, b]) : Buffer.concat([b, a]));
}

/** Leaf for one issued version: binds the PDF hash to its passport, version and code. */
export function versionLeaf(v: {
  passportId: string;
  version: number;
  verificationCode: string;
  pdfSha256: string;
}) {
  return sha256(
    Buffer.from(`BTU-AISP-v1|${v.passportId}|${v.version}|${v.verificationCode}|${v.pdfSha256}`),
  ).toString("hex");
}

export function buildMerkleTree(leavesHex: string[]) {
  if (leavesHex.length === 0) throw new Error("Cannot build a Merkle tree without leaves.");
  const levels: Buffer[][] = [leavesHex.map((h) => Buffer.from(h, "hex"))];
  while (levels[levels.length - 1]!.length > 1) {
    const level = levels[levels.length - 1]!;
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2)
      next.push(i + 1 < level.length ? parent(level[i]!, level[i + 1]!) : level[i]!);
    levels.push(next);
  }
  const root = levels[levels.length - 1]![0]!.toString("hex");
  const proof = (index: number) => {
    const path: string[] = [];
    for (let l = 0, i = index; l < levels.length - 1; l++, i = Math.floor(i / 2)) {
      const sibling = levels[l]![i % 2 === 0 ? i + 1 : i - 1];
      if (sibling) path.push(sibling.toString("hex"));
    }
    return path;
  };
  return { root, proof };
}

export function verifyMerkleProof(leafHex: string, proof: string[], rootHex: string) {
  let node = Buffer.from(leafHex, "hex");
  for (const sibling of proof) node = parent(node, Buffer.from(sibling, "hex"));
  return node.toString("hex") === rootHex.toLowerCase();
}
