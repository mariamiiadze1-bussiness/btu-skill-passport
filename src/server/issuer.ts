import { privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress, type Hex } from "viem";

import { anchorChain } from "./anchoring/chains";
import { UserError } from "./errors";

/**
 * BTU's issuer identity: one secp256k1 key that (1) signs every issued version and
 * (2) sends the blockchain anchoring transactions. Its address is published in the DID
 * document at /.well-known/did.json on BTU's domain, which is what ties the key to BTU.
 */

export const ISSUER_NAME = "Business and Technology University (BTU)";

export function issuerDid() {
  if (process.env.ISSUER_DID) return process.env.ISSUER_DID;
  const host = process.env.APP_URL ? new URL(process.env.APP_URL).host : "localhost%3A8080";
  return `did:web:${host.replace(":", "%3A")}`;
}

/** did:web → the HTTPS URL of its DID document (W3C did:web method). */
export function didDocumentUrl(did = issuerDid()) {
  const [host = "", ...path] = did
    .replace(/^did:web:/, "")
    .split(":")
    .map(decodeURIComponent);
  const scheme = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return path.length
    ? `${scheme}://${host}/${path.join("/")}/did.json`
    : `${scheme}://${host}/.well-known/did.json`;
}

export function getIssuerAccount() {
  const key = process.env.ISSUER_PRIVATE_KEY?.trim();
  if (!key)
    throw new UserError(
      "The BTU issuer key (ISSUER_PRIVATE_KEY) is not set, so passports cannot be signed. See .env.example.",
    );
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
}

export function issuerAddress() {
  return process.env.ISSUER_PRIVATE_KEY ? getIssuerAccount().address : null;
}

/** EIP-191 signature over the version's Merkle leaf. */
export async function signLeaf(leafHex: string) {
  return getIssuerAccount().signMessage({ message: { raw: `0x${leafHex}` } });
}

export async function recoverLeafSigner(leafHex: string, signature: string) {
  try {
    return await recoverMessageAddress({
      message: { raw: `0x${leafHex}` },
      signature: signature as Hex,
    });
  } catch {
    return null;
  }
}

export function didDocument(origin: string) {
  const did = issuerDid();
  const address = issuerAddress();
  const chainId = anchorChain().id;
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/secp256k1recovery-2020/v2",
    ],
    id: did,
    alsoKnownAs: [ISSUER_NAME],
    verificationMethod: address
      ? [
          {
            id: `${did}#issuer`,
            type: "EcdsaSecp256k1RecoveryMethod2020",
            controller: did,
            blockchainAccountId: `eip155:${chainId}:${address}`,
          },
        ]
      : [],
    assertionMethod: address ? [`${did}#issuer`] : [],
    service: [
      { id: `${did}#verify`, type: "PassportVerification", serviceEndpoint: `${origin}/verify` },
    ],
  };
}
