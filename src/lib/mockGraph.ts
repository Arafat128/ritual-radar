import type { GraphData, GraphEdge, GraphNode } from "@/lib/graphTypes";

/** Deterministic demo neighborhood for UI / offline work (not live chain data) */
export function buildMockGraph(rootInput: string): GraphData {
  const root = (
    rootInput || "0xd3309bf2e2d1f451132dbc34dc5908c442903458"
  ).toLowerCase();

  const nodes: GraphNode[] = [
    {
      id: root,
      type: "eoa",
      label: "Demo root",
      balance: "2870000000000000000",
      txCount: 142,
      firstSeen: 48_000_000,
      lastSeen: 52_730_000,
      live: false,
    },
    {
      id: "0xc3abfe878c670016db959b5df10a27e502fe997d",
      type: "sovereign_agent",
      label: "Demo Sovereign",
      agentStatus: "active",
      balance: "0",
      txCount: 4,
      firstSeen: 52_700_000,
      lastSeen: 52_710_000,
      live: false,
    },
    {
      id: "0xbbfb6d1c4962dce01ac92e5095fa6c40266d08b0",
      type: "persistent_agent",
      label: "Demo Persistent",
      agentStatus: "active",
      balance: "150000000000000000",
      txCount: 890,
      firstSeen: 50_000_000,
      lastSeen: 52_722_500,
      live: false,
    },
    {
      id: "0x128494472d72d2fb71bb808c041c956184e6c9f2",
      type: "persistent_agent",
      label: "Demo Persistent B",
      agentStatus: "reviving",
      balance: "80000000000000000",
      txCount: 420,
      lastSeen: 52_720_000,
      live: false,
    },
    {
      id: "0xef505e801f1db392b5289690e2ffc20e840a3aca",
      type: "precompile",
      label: "AgentHeartbeat",
      txCount: 50_000,
      lastSeen: 52_722_544,
      live: false,
    },
    {
      id: "0x9dc4c054e53bcc4ce0a0ff09e890a7a8e817f304",
      type: "contract",
      label: "SovereignFactory",
      txCount: 2_100,
      lastSeen: 52_710_000,
      live: false,
    },
    {
      id: "0xd4aa9d55215dc8149af57605e70921ea16b73591",
      type: "contract",
      label: "PersistentFactory",
      txCount: 1_800,
      lastSeen: 52_700_000,
      live: false,
    },
    {
      id: "0x50a3fb54aa1289546a0be2d6b29d689bb2dd5f6f",
      type: "contract",
      label: "RadarAgent",
      txCount: 900,
      lastSeen: 52_730_000,
      live: false,
    },
    {
      id: "0x3c71122f28d6d50fe9d977a0e20ede6e20f28cee",
      type: "eoa",
      label: "Demo Keeper",
      balance: "100000000000000000",
      txCount: 3_200,
      lastSeen: 52_730_400,
      live: false,
    },
    {
      id: "0xa8063aa535f06cf3fedb8b1da70d6cf09b865d83",
      type: "eoa",
      label: "Demo Peer",
      balance: "500000000000000000",
      txCount: 55,
      lastSeen: 52_680_000,
      live: false,
    },
    {
      id: "0x56e776bae2dd60664b69bd5f865f1180ffb7d58b",
      type: "contract",
      label: "Scheduler",
      txCount: 12_000,
      lastSeen: 52_710_000,
      live: false,
    },
    // Valid-looking hex address (was invalid 0x…fail before)
    {
      id: "0xdead00000000000000000000000000000000dead",
      type: "persistent_agent",
      label: "Demo failed agent",
      agentStatus: "failed",
      balance: "0",
      txCount: 12,
      lastSeen: 51_000_000,
      live: false,
    },
  ];

  const now = Date.now();
  const edges: GraphEdge[] = [
    {
      id: "e1",
      source: root,
      target: "0xc3abfe878c670016db959b5df10a27e502fe997d",
      type: "call",
      value: "120000000000000000",
      timestamp: now - 3_600_000,
      txHash:
        "0x4b46360f2d7a56e0786951b2fd3ffbdc03824cf17c36e62e0f8713182a8385e2",
      live: false,
    },
    {
      id: "e2",
      source: root,
      target: "0x9dc4c054e53bcc4ce0a0ff09e890a7a8e817f304",
      type: "call",
      value: "5000000000000000",
      timestamp: now - 3_700_000,
      txHash:
        "0xaaa1000000000000000000000000000000000000000000000000000000000001",
      live: false,
    },
    {
      id: "e3",
      source: "0xbbfb6d1c4962dce01ac92e5095fa6c40266d08b0",
      target: "0xef505e801f1db392b5289690e2ffc20e840a3aca",
      type: "heartbeat",
      value: "0",
      timestamp: now - 30_000,
      txHash:
        "0xbbb2000000000000000000000000000000000000000000000000000000000002",
      live: false,
    },
    {
      id: "e4",
      source: "0x128494472d72d2fb71bb808c041c956184e6c9f2",
      target: "0xef505e801f1db392b5289690e2ffc20e840a3aca",
      type: "heartbeat",
      value: "0",
      timestamp: now - 90_000,
      txHash:
        "0xbbb3000000000000000000000000000000000000000000000000000000000003",
      live: false,
    },
    {
      id: "e5",
      source: root,
      target: "0x3c71122f28d6d50fe9d977a0e20ede6e20f28cee",
      type: "transfer",
      value: "50000000000000000",
      timestamp: now - 86_400_000,
      txHash:
        "0xccc4000000000000000000000000000000000000000000000000000000000004",
      live: false,
    },
    {
      id: "e6",
      source: "0x3c71122f28d6d50fe9d977a0e20ede6e20f28cee",
      target: "0x50a3fb54aa1289546a0be2d6b29d689bb2dd5f6f",
      type: "call",
      value: "0",
      timestamp: now - 120_000,
      txHash:
        "0xddd5000000000000000000000000000000000000000000000000000000000005",
      live: false,
    },
    {
      id: "e7",
      source: root,
      target: "0xa8063aa535f06cf3fedb8b1da70d6cf09b865d83",
      type: "transfer",
      value: "10000000000000000",
      timestamp: now - 172_800_000,
      txHash:
        "0xeee6000000000000000000000000000000000000000000000000000000000006",
      live: false,
    },
    {
      id: "e8",
      source: "0xc3abfe878c670016db959b5df10a27e502fe997d",
      target: "0x56e776bae2dd60664b69bd5f865f1180ffb7d58b",
      type: "scheduled",
      value: "100000000000000000",
      timestamp: now - 3_500_000,
      txHash:
        "0xfff7000000000000000000000000000000000000000000000000000000000007",
      live: false,
    },
    {
      id: "e9",
      source: root,
      target: "0xd4aa9d55215dc8149af57605e70921ea16b73591",
      type: "call",
      value: "2150000000000000000",
      timestamp: now - 604_800_000,
      txHash:
        "0x1118000000000000000000000000000000000000000000000000000000000008",
      live: false,
    },
    {
      id: "e10",
      source: "0xa8063aa535f06cf3fedb8b1da70d6cf09b865d83",
      target: "0xbbfb6d1c4962dce01ac92e5095fa6c40266d08b0",
      type: "async",
      value: "25000000000000000",
      timestamp: now - 400_000,
      txHash:
        "0x2229000000000000000000000000000000000000000000000000000000000009",
      live: false,
    },
  ];

  return {
    root,
    nodes,
    edges,
    blockHeight: 52_722_544,
    fetchedAt: new Date().toISOString(),
    source: "mock",
    note: "Demo topology only — not chain data. Use Scan for live RPC + agent registry.",
  };
}

/** log10 scale 0..1 for edge thickness / brightness */
export function normalizeValueWei(valueWei: string, maxWei: bigint): number {
  try {
    const v = BigInt(valueWei || "0");
    if (v <= BigInt(0) || maxWei <= BigInt(0)) return 0.15;
    const lv = Math.log10(Number(v) + 1);
    const lm = Math.log10(Number(maxWei) + 1);
    return Math.min(1, Math.max(0.12, lv / lm));
  } catch {
    return 0.2;
  }
}
