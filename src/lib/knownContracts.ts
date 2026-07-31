/** Known Ritual system + app contracts (lowercase) for labeling */

export const KNOWN_CONTRACTS: Record<string, string> = {
  // System
  "0x532f0df0896f353d8c3dd8cc134e8129da2a3948": "RitualWallet",
  "0xc069ffca0389f44eca2c626e55491b0ab045aef5": "AsyncJobTracker",
  "0x9644e8562ce0fe12b4deec4163c064a8862bf47f": "TEEServiceRegistry",
  "0x56e776bae2dd60664b69bd5f865f1180ffb7d58b": "Scheduler",
  "0x5a16214ff555848411544b005f7ac063742f39f6": "AsyncDelivery",
  "0xef505e801f1db392b5289690e2ffc20e840a3aca": "AgentHeartbeat",
  "0x7a85f48b971cebb75491b61abe279728f4c4384f": "ModelPricingRegistry",
  "0xf9bf1bc8a3e79b9ebed0fa2db70d0513fece32fd": "SecretsAccessControl",
  "0x9dc4c054e53bcc4ce0a0ff09e890a7a8e817f304": "SovereignAgentFactory",
  "0xd4aa9d55215dc8149af57605e70921ea16b73591": "PersistentAgentFactory",
  // Precompiles (selected)
  "0x0000000000000000000000000000000000000801": "HTTP precompile",
  "0x0000000000000000000000000000000000000802": "LLM precompile",
  "0x000000000000000000000000000000000000080c": "Sovereign Agent",
  "0x0000000000000000000000000000000000000820": "Persistent Agent",
  "0x0000000000000000000000000000000000000818": "Image precompile",
  // App contracts (Rite / chain-apps)
  "0x50a3fb54aa1289546a0be2d6b29d689bb2dd5f6f": "RadarAgent (Rite)",
  "0xd3469a23b2a08b237bc6c0522845eb1b508e5352": "ResearchDesk (Rite)",
  "0xbc4bc83298950cbda52837cd806d41ad7c3c36bf": "BountyPool (Rite)",
  "0x70ef10629abc2b3d3fe1be850c093da2e2a5831e": "OracleRoast",
  "0x31ee555dd23304421737c156f9a1cc353dacf015": "VaultKeeper",
  "0xa568012b5c1be35fba52f91291237c82cf97e969": "GlyphOracle",
};

export const SYSTEM_HUBS = [
  "0xef505e801f1db392b5289690e2ffc20e840a3aca",
  "0x56e776bae2dd60664b69bd5f865f1180ffb7d58b",
  "0x532f0df0896f353d8c3dd8cc134e8129da2a3948",
  "0x9dc4c054e53bcc4ce0a0ff09e890a7a8e817f304",
  "0xd4aa9d55215dc8149af57605e70921ea16b73591",
] as const;
