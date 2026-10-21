/**
 * A place to anchor Merkle roots so anyone can check them independently.
 * To switch blockchains, add an implementation and register it in ./index.ts.
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
