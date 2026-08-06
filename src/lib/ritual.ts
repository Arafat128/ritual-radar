/** Ritual Chain constants — verified against docs + explorers */

export const RITUAL_CHAIN_ID = 1979;
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.ritualfoundation.org";
export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer.ritualfoundation.org";
export const AGENTS_URL = `${EXPLORER_URL.replace(/\/$/, "")}/agents`;
export const FAUCET_URL = "https://faucet.ritualfoundation.org";

/**
 * Known system / precompile hubs for labeling + node typing.
 * Lowercase keys only.
 */
export const PRECOMPILE_HINTS: Record<string, string> = {
  // System contracts (shown as precompile/system-class nodes in UI filters via type)
  "0xef505e801f1db392b5289690e2ffc20e840a3aca": "AgentHeartbeat",
  "0x532f0df0896f353d8c3dd8cc134e8129da2a3948": "RitualWallet",
  "0xc069ffca0389f44eca2c626e55491b0ab045aef5": "AsyncJobTracker",
  "0x9644e8562ce0fe12b4deec4163c064a8862bf47f": "TEEServiceRegistry",
  "0x56e776bae2dd60664b69bd5f865f1180ffb7d58b": "Scheduler",
  "0x5a16214ff555848411544b005f7ac063742f39f6": "AsyncDelivery",
  "0x7a85f48b971cebb75491b61abe279728f4c4384f": "ModelPricingRegistry",
  "0xf9bf1bc8a3e79b9ebed0fa2db70d0513fece32fd": "SecretsAccessControl",
  // Precompiles used by Core Lab + agents
  "0x0000000000000000000000000000000000000009": "Ed25519 precompile",
  "0x0000000000000000000000000000000000000100": "SECP256R1 precompile",
  "0x0000000000000000000000000000000000000800": "ONNX precompile",
  "0x0000000000000000000000000000000000000801": "HTTP precompile",
  "0x0000000000000000000000000000000000000802": "LLM precompile",
  "0x0000000000000000000000000000000000000803": "JQ precompile",
  "0x0000000000000000000000000000000000000805": "Long HTTP precompile",
  "0x000000000000000000000000000000000000080c": "Sovereign Agent precompile",
  "0x0000000000000000000000000000000000000818": "Image precompile",
  "0x0000000000000000000000000000000000000819": "Audio precompile",
  "0x000000000000000000000000000000000000081a": "Video precompile",
  "0x000000000000000000000000000000000000081b": "DKMS precompile",
  "0x0000000000000000000000000000000000000820": "Persistent Agent precompile",
  "0x0000000000000000000000000000000000000830": "TX Hash precompile",
};

/** True for Ritual precompile address space (0x0…0xxx with very low values) */
export function isPrecompileAddress(addr: string): boolean {
  const a = addr.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return false;
  // 20-byte address with top 18 bytes zero → low precompile range
  return a.startsWith("0x000000000000000000000000000000000000");
}

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
