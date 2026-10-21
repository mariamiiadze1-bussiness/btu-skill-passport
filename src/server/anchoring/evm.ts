import {
  createPublicClient,
  createWalletClient,
  formatEther,
  fromHex,
  http,
  toHex,
  type Hex,
} from "viem";

import { getIssuerAccount } from "../issuer";
import { anchorChain } from "./chains";
import { ANCHOR_PREFIX, type AnchorProvider } from "./types";

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
