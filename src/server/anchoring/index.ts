import { createEvmAnchor } from "./evm";
import type { AnchorProvider } from "./types";

export type { AnchorProvider } from "./types";

/**
 * Picks the anchoring backend from ANCHOR_PROVIDER:
 *   "evm"  — Ethereum Sepolia by default; any EVM chain via ANCHOR_CHAIN / ANCHOR_RPC_URL
 *   "none" — no blockchain (local development only; verify page says so)
 * Add another backend (e.g. OpenTimestamps, Hyperledger) by implementing AnchorProvider.
 */
const PROVIDERS: Record<string, () => AnchorProvider> = { evm: createEvmAnchor };

let override: AnchorProvider | null | undefined;

/** Tests inject a fake chain. */
export function setAnchorProvider(provider: AnchorProvider | null | undefined) {
  override = provider;
}

export function getAnchorProvider(): AnchorProvider | null {
  if (override !== undefined) return override;
  const name = process.env.ANCHOR_PROVIDER ?? (process.env.ISSUER_PRIVATE_KEY ? "evm" : "none");
  if (name === "none") return null;
  const create = PROVIDERS[name];
  if (!create)
    throw new Error(
      `Unknown ANCHOR_PROVIDER "${name}". Use one of: none, ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  return create();
}
