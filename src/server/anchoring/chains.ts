import type { Chain } from "viem";
import { base, baseSepolia, mainnet, polygon, polygonAmoy, sepolia } from "viem/chains";

/** EVM networks selectable with ANCHOR_CHAIN. Add any viem chain here to support it. */
export const CHAINS: Record<string, Chain> = {
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
