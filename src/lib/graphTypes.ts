/** Ritual Radar graph taxonomy (matches explorer mental model) */

export type NodeType =
  | "eoa"
  | "contract"
  | "sovereign_agent"
  | "persistent_agent"
  | "precompile";

/** Mirrors explorer.ritualfoundation.org/agents filters */
export type AgentStatus = "active" | "reviving" | "failed";

export type EdgeType =
  | "transfer"
  | "call"
  | "async"
  | "scheduled"
  | "heartbeat";

export type GraphSource = "mock" | "live" | "live_partial";

export interface GraphNode {
  id: string;
  type: NodeType;
  label?: string;
  agentStatus?: AgentStatus;
  balance?: string;
  txCount: number;
  firstSeen?: number;
  lastSeen?: number;
  /** true when fields came from RPC / agent cache (not demo seed) */
  live?: boolean;
  /** force layout position (mutated by simulation) */
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  value: string;
  timestamp: number;
  txHash: string;
  live?: boolean;
  /** block number when known (live txs) */
  blockNumber?: number;
  /** first 4 bytes of input as 0x-hex (contract calls) */
  methodId?: string;
  /** resolved after layout for rendering */
  sourceNode?: GraphNode;
  targetNode?: GraphNode;
}

/** One on-chain interaction (for side panel tx list) */
export interface GraphInteraction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  timestamp: number;
  blockNumber: number;
  type: EdgeType;
  methodId?: string;
  direction: "out" | "in" | "self";
}

export interface GraphData {
  root: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  blockHeight?: number;
  fetchedAt: string;
  source: GraphSource;
  note?: string;
  /** true when deep tx scan was enabled for this result */
  fullHistory?: boolean;
  /** real txs involving root (newest first), only when fullHistory */
  interactions?: GraphInteraction[];
}

export const AGENT_STATUS_COLOR: Record<AgentStatus, string> = {
  active: "#22d3ee",
  reviving: "#f59e0b",
  failed: "#ef4444",
};

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  eoa: "EOA",
  contract: "Contract",
  sovereign_agent: "Sovereign",
  persistent_agent: "Persistent",
  precompile: "Precompile",
};

export const EDGE_TYPE_COLOR: Record<EdgeType, string> = {
  transfer: "#c8ff4a",
  call: "#818cf8",
  async: "#22d3ee",
  scheduled: "#f472b6",
  heartbeat: "#64748b",
};
