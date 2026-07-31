/** Ritual Chain constants — verified against docs + explorers */

export const RITUAL_CHAIN_ID = 1979;
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.ritualfoundation.org";
export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer.ritualfoundation.org";
export const AGENTS_URL = `${EXPLORER_URL.replace(/\/$/, "")}/agents`;
export const FAUCET_URL = "https://faucet.ritualfoundation.org";

/** Known system / high-degree hubs — hidden by default in the graph */
export const PRECOMPILE_HINTS: Record<string, string> = {
  // AgentHeartbeat registry (Persistent heartbeats) — from Rite / explorer usage
  "0xef505e801f1db392b5289690e2ffc20e840a3aca": "AgentHeartbeat",
};

export function explorerAddressUrl(addr: string) {
  return `${EXPLORER_URL.replace(/\/$/, "")}/address/${addr}`;
}

export function explorerTxUrl(hash: string) {
  return `${EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}`;
}

export function shortAddr(addr: string, n = 4) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 2 + n)}…${addr.slice(-n)}`;
}
