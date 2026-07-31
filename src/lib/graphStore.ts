"use client";

import { create } from "zustand";
import type {
  EdgeType,
  GraphData,
  GraphEdge,
  GraphNode,
  NodeType,
} from "@/lib/graphTypes";
import { buildMockGraph } from "@/lib/mockGraph";

export type Filters = {
  nodeTypes: Set<NodeType>;
  edgeTypes: Set<EdgeType>;
  showPrecompiles: boolean;
  minValueEth: number;
  depth: number;
};

type GraphStore = {
  query: string;
  loading: boolean;
  error: string | null;
  graph: GraphData | null;
  selectedId: string | null;
  filters: Filters;
  timelineT: number; // 0..1 scrubber
  blockHeight: number | null;
  setQuery: (q: string) => void;
  setSelected: (id: string | null) => void;
  setTimelineT: (t: number) => void;
  setBlockHeight: (n: number | null) => void;
  toggleNodeType: (t: NodeType) => void;
  toggleEdgeType: (t: EdgeType) => void;
  setShowPrecompiles: (v: boolean) => void;
  setDepth: (d: number) => void;
  setMinValueEth: (n: number) => void;
  loadMock: (address?: string) => void;
  loadLive: (address: string) => Promise<void>;
  applyLayoutPositions: (
    positions: Record<string, { x: number; y: number; z: number }>
  ) => void;
};

const defaultFilters = (): Filters => ({
  nodeTypes: new Set<NodeType>([
    "eoa",
    "contract",
    "sovereign_agent",
    "persistent_agent",
  ]),
  edgeTypes: new Set<EdgeType>([
    "transfer",
    "call",
    "async",
    "scheduled",
    "heartbeat",
  ]),
  showPrecompiles: false,
  minValueEth: 0,
  depth: 1,
});

export const useGraphStore = create<GraphStore>((set, get) => ({
  query: "",
  loading: false,
  error: null,
  graph: null,
  selectedId: null,
  filters: defaultFilters(),
  timelineT: 1,
  blockHeight: null,

  setQuery: (q) => set({ query: q }),
  setSelected: (id) => set({ selectedId: id }),
  setTimelineT: (t) => set({ timelineT: Math.min(1, Math.max(0, t)) }),
  setBlockHeight: (n) => set({ blockHeight: n }),

  toggleNodeType: (t) => {
    const next = new Set(get().filters.nodeTypes);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    set({ filters: { ...get().filters, nodeTypes: next } });
  },
  toggleEdgeType: (t) => {
    const next = new Set(get().filters.edgeTypes);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    set({ filters: { ...get().filters, edgeTypes: next } });
  },
  setShowPrecompiles: (v) =>
    set({ filters: { ...get().filters, showPrecompiles: v } }),
  setDepth: (d) =>
    set({ filters: { ...get().filters, depth: Math.min(3, Math.max(1, d)) } }),
  setMinValueEth: (n) =>
    set({ filters: { ...get().filters, minValueEth: Math.max(0, n) } }),

  loadMock: (address) => {
    const root = (address || get().query || "").trim() || undefined;
    const graph = buildMockGraph(root || "");
    set({
      graph,
      loading: false,
      error: null,
      selectedId: graph.root,
      query: graph.root,
      timelineT: 1,
      blockHeight: graph.blockHeight ?? null,
    });
  },

  loadLive: async (address) => {
    const addr = address.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(addr)) {
      set({ error: "Enter a valid 0x address (40 hex chars)" });
      return;
    }
    set({ loading: true, error: null, query: addr });
    try {
      const res = await fetch(`/api/graph?address=${encodeURIComponent(addr)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "fetch failed");
      // Until full history API is wired, API may return enriched mock
      set({
        graph: data.graph as GraphData,
        loading: false,
        selectedId: addr,
        timelineT: 1,
        blockHeight: data.graph?.blockHeight ?? data.blockHeight ?? null,
      });
    } catch (e) {
      // Graceful: fall back to mock so the product stays usable
      const graph = buildMockGraph(addr);
      set({
        graph,
        loading: false,
        error:
          (e instanceof Error ? e.message : "Live graph unavailable") +
          " — showing mock neighborhood",
        selectedId: addr,
        blockHeight: graph.blockHeight ?? null,
      });
    }
  },

  applyLayoutPositions: (positions) => {
    const g = get().graph;
    if (!g) return;
    const nodes = g.nodes.map((n) => {
      const p = positions[n.id];
      return p ? { ...n, x: p.x, y: p.y, z: p.z } : n;
    });
    set({ graph: { ...g, nodes } });
  },
}));

export function filterGraph(
  graph: GraphData,
  filters: Filters,
  timelineT: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const times = graph.edges.map((e) => e.timestamp);
  const tMin = times.length ? Math.min(...times) : 0;
  const tMax = times.length ? Math.max(...times) : 1;
  const cutoff = tMin + (tMax - tMin) * timelineT;

  let edges = graph.edges.filter((e) => {
    if (!filters.edgeTypes.has(e.type)) return false;
    if (e.timestamp > cutoff) return false;
    try {
      const wei = BigInt(e.value || "0");
      const min = BigInt(Math.floor(filters.minValueEth * 1e18));
      if (min > BigInt(0) && wei < min && e.type === "transfer") return false;
    } catch {
      /* keep */
    }
    return true;
  });

  const nodeIds = new Set<string>([graph.root]);
  for (const e of edges) {
    nodeIds.add(e.source);
    nodeIds.add(e.target);
  }

  const nodes = graph.nodes.filter((n) => {
    if (!nodeIds.has(n.id) && n.id !== graph.root) return false;
    if (n.type === "precompile" && !filters.showPrecompiles) {
      // keep if root is precompile
      return n.id === graph.root;
    }
    if (n.type !== "precompile" && !filters.nodeTypes.has(n.type)) {
      return n.id === graph.root;
    }
    return true;
  });

  const visible = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => visible.has(e.source) && visible.has(e.target));

  // Heartbeat spam: collapse many heartbeats to same pair — keep latest only for render
  const hbKey = new Map<string, GraphEdge>();
  const rest: GraphEdge[] = [];
  for (const e of edges) {
    if (e.type === "heartbeat") {
      const k = `${e.source}->${e.target}`;
      const prev = hbKey.get(k);
      if (!prev || e.timestamp > prev.timestamp) hbKey.set(k, e);
    } else {
      rest.push(e);
    }
  }
  edges = [...rest, ...Array.from(hbKey.values())];

  // Self-loops (scheduled wake) excluded from edges
  edges = edges.filter((e) => e.source !== e.target);

  return { nodes, edges };
}
