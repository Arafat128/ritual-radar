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

export interface GraphNode {
  id: string;
  type: NodeType;
  label?: string;
  agentStatus?: AgentStatus;
  balance?: string;
  txCount: number;
  firstSeen?: number;
  lastSeen?: number;
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
  /** resolved after layout for rendering */
  sourceNode?: GraphNode;
  targetNode?: GraphNode;
}

export interface GraphData {
  root: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  blockHeight?: number;
  fetchedAt: string;
  source: "mock" | "live";
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
