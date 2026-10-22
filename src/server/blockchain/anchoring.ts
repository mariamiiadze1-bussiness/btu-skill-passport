import {
  createPublicClient,
  createWalletClient,
  formatEther,
  fromHex,
  http,
  toHex,
  type Chain,
  type Hex,
} from "viem";
import { base, baseSepolia, mainnet, polygon, polygonAmoy, sepolia } from "viem/chains";

import { getIssuerAccount } from "./issuer";

/**
 * A place to anchor Merkle roots so anyone can check them independently.
 * To switch blockchains, add an implementation and register it in PROVIDERS below.
 */
export interface AnchorProvider {
  /** Stable id stored with each batch, e.g. "evm:11155111". */
  readonly id: string;
  /** Human-readable network name shown on the verify page. */
  readonly network: string;
  /** Publishes the root; returns a transaction id without waiting for confirmation. */
  submit(rootHex: string): Promise<{ txHash: string }>;
  /** Checks a submitted transaction. */
  status(
    txHash: string,
  ): Promise<
    | { state: "pending" }
    | { state: "confirmed"; blockNumber: number }
    | { state: "failed"; error: string }
  >;
  /** Reads an anchor back from the chain for live, independent verification. */
  read(
    txHash: string,
  ): Promise<{ from: string; rootHex: string | null; blockNumber: number | null } | null>;
  explorerUrl(txHash: string): string | null;
  /** Balance etc. for the admin panel; never throws. */
  health(): Promise<{ address: string; balance: string | null; ok: boolean }>;
}

export const ANCHOR_PREFIX = "BTU-AISP:";

/** EVM networks selectable with ANCHOR_CHAIN. Add any viem chain here to support it. */
const CHAINS: Record<string, Chain> = {
  sepolia,
  polygonAmoy,
  baseSepolia,
  mainnet,
  polygon,
  base,
};

export function anchorChain() {
  const name = process.env.ANCHOR_CHAIN ?? "sepolia";
  const chain = CHAINS[name];
  if (!chain)
    throw new Error(
      `Unknown ANCHOR_CHAIN "${name}". Use one of: ${Object.keys(CHAINS).join(", ")}.`,
    );
  return chain;
}

/**
 * Anchors roots on any EVM chain as a zero-value transaction from the BTU issuer address to
 * itself, with "BTU-AISP:<root>" as calldata. No smart contract to deploy or maintain; the
 * transaction's sender is the issuer key published in BTU's DID document.
 */
export function createEvmAnchor(): AnchorProvider {
  const chain = anchorChain();
  const transport = http(process.env.ANCHOR_RPC_URL || undefined, {
    timeout: 20_000,
    retryCount: 2,
  });
  const account = getIssuerAccount();
  const publicClient = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ chain, transport, account });
  const explorer = chain.blockExplorers?.default.url;

  return {
    id: `evm:${chain.id}`,
    network: chain.name,
    async submit(rootHex) {
      const txHash = await wallet.sendTransaction({
        to: account.address,
        value: 0n,
        data: toHex(`${ANCHOR_PREFIX}${rootHex}`),
      });
      return { txHash };
    },
    async status(txHash) {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
        return receipt.status === "success"
          ? { state: "confirmed", blockNumber: Number(receipt.blockNumber) }
          : { state: "failed", error: "Transaction reverted." };
      } catch {
        return { state: "pending" };
      }
    },
    async read(txHash) {
      try {
        const tx = await publicClient.getTransaction({ hash: txHash as Hex });
        const text = fromHex(tx.input, "string");
        return {
          from: tx.from,
          rootHex: text.startsWith(ANCHOR_PREFIX) ? text.slice(ANCHOR_PREFIX.length) : null,
          blockNumber: tx.blockNumber === null ? null : Number(tx.blockNumber),
        };
      } catch {
        return null;
      }
    },
    explorerUrl: (txHash) => (explorer ? `${explorer}/tx/${txHash}` : null),
    async health() {
      try {
        const balance = await publicClient.getBalance({ address: account.address });
        return {
          address: account.address,
          balance: `${formatEther(balance)} ${chain.nativeCurrency.symbol}`,
          ok: balance > 0n,
        };
      } catch {
        return { address: account.address, balance: null, ok: false };
      }
    },
  };
}

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
