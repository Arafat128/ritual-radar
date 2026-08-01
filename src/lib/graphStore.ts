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

const FULL_TX_STORAGE_KEY = "ritual-radar-full-tx";

function readStoredFullTx(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FULL_TX_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type GraphStore = {
  query: string;
  loading: boolean;
  error: string | null;
  graph: GraphData | null;
  selectedId: string | null;
  filters: Filters;
  timelineT: number;
  blockHeight: number | null;
  lastRefreshAt: number | null;
  autoRefresh: boolean;
  /**
   * Opt-in deep tx scan — only for full Radar website.
   * Embeds always force this false.
   */
  fullHistory: boolean;
  embedMode: boolean;
  rootLive: {
    balanceRit?: string;
    type?: string;
    txCount?: number;
  } | null;
  meta: {
    liveEdges?: number;
    blocksScanned?: number;
    persistentCount?: number;
    sovereignCount?: number;
    fullHistory?: boolean;
    realTxCount?: number;
  } | null;
  setQuery: (q: string) => void;
  setSelected: (id: string | null) => void;
  setTimelineT: (t: number) => void;
  setBlockHeight: (n: number | null) => void;
  setAutoRefresh: (v: boolean) => void;
  setEmbedMode: (v: boolean) => void;
  setFullHistory: (v: boolean) => void;
  toggleNodeType: (t: NodeType) => void;
  toggleEdgeType: (t: EdgeType) => void;
  setShowPrecompiles: (v: boolean) => void;
  setDepth: (d: number) => void;
  setMinValueEth: (n: number) => void;
  loadMock: (address?: string) => void;
  loadLive: (
    address: string,
    opts?: { silent?: boolean; fullHistory?: boolean }
  ) => Promise<void>;
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
  depth: 2,
});

let liveAbort: AbortController | null = null;

export const useGraphStore = create<GraphStore>((set, get) => ({
  query: "",
  loading: false,
  error: null,
  graph: null,
  selectedId: null,
  filters: defaultFilters(),
  timelineT: 1,
  blockHeight: null,
  lastRefreshAt: null,
  autoRefresh: true,
  fullHistory: false,
  embedMode: false,
  rootLive: null,
  meta: null,

  setQuery: (q) => set({ query: q }),
  setSelected: (id) => set({ selectedId: id }),
  setTimelineT: (t) => set({ timelineT: Math.min(1, Math.max(0, t)) }),
  setBlockHeight: (n) => set({ blockHeight: n }),
  setAutoRefresh: (v) => set({ autoRefresh: v }),
  setEmbedMode: (v) => {
    if (v) {
      // Embeds never get full history
      set({ embedMode: true, fullHistory: false });
    } else {
      set({ embedMode: false, fullHistory: readStoredFullTx() });
    }
  },
  setFullHistory: (v) => {
    if (get().embedMode) {
      set({ fullHistory: false });
      return;
    }
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(FULL_TX_STORAGE_KEY, v ? "1" : "0");
      }
    } catch {
      /* private mode */
    }
    set({ fullHistory: v });
    // Re-scan current address with new mode
    const q = get().query || get().graph?.root;
    if (q && /^0x[a-f0-9]{40}$/i.test(q) && get().graph?.source !== "mock") {
      void get().loadLive(q, { fullHistory: v });
    }
  },

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
    liveAbort?.abort();
    const root = (address || get().query || "").trim() || undefined;
    const graph = buildMockGraph(root || "");
    set({
      graph,
      loading: false,
      error: null,
      selectedId: graph.root,
      query: graph.root,
      timelineT: 1,
      blockHeight: null,
      lastRefreshAt: Date.now(),
      rootLive: null,
      meta: null,
    });
  },

  loadLive: async (address, opts) => {
    const addr = address.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(addr)) {
      set({ error: "Enter a valid 0x address (40 hex chars)" });
      return;
    }
    liveAbort?.abort();
    const ac = new AbortController();
    liveAbort = ac;
    if (!opts?.silent) {
      set({ loading: true, error: null, query: addr });
    } else {
      set({ query: addr });
    }

    const embed = get().embedMode;
    const full =
      !embed &&
      (opts?.fullHistory !== undefined
        ? opts.fullHistory
        : get().fullHistory);

    try {
      const qs = new URLSearchParams({ address: addr });
      if (full) qs.set("full", "1");
      if (embed) qs.set("embed", "1");

      const res = await fetch(`/api/graph?${qs.toString()}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "fetch failed");
      const graph = data.graph as GraphData;
      set({
        graph,
        loading: false,
        error: null,
        selectedId: get().selectedId || addr,
        timelineT: 1,
        blockHeight: graph.blockHeight ?? data.blockHeight ?? null,
        lastRefreshAt: Date.now(),
        rootLive: data.rootLive
          ? {
              balanceRit: data.rootLive.balanceRit,
              type: data.rootLive.type,
              txCount: data.rootLive.txCount,
            }
          : null,
        meta: data.meta
          ? {
              liveEdges: data.meta.liveEdges,
              blocksScanned: data.meta.blocksScanned,
              persistentCount: data.meta.persistentCount,
              sovereignCount: data.meta.sovereignCount,
              fullHistory: data.meta.fullHistory,
              realTxCount: data.meta.realTxCount,
            }
          : null,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (opts?.silent && get().graph?.source !== "mock") {
        set({
          error:
            (e instanceof Error ? e.message : "Refresh failed") +
            " — keeping previous graph",
        });
        return;
      }
      const graph = buildMockGraph(addr);
      set({
        graph,
        loading: false,
        error:
          (e instanceof Error ? e.message : "Live graph unavailable") +
          " — showing demo neighborhood",
        selectedId: addr,
        blockHeight: null,
        lastRefreshAt: Date.now(),
        rootLive: null,
        meta: null,
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

/** BFS hop distance from root */
function hopDistance(
  root: string,
  edges: GraphEdge[],
  maxDepth: number
): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }
  const keep = new Set<string>([root]);
  let frontier = [root];
  for (let d = 0; d < maxDepth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const peer of adj.get(id) || []) {
        if (keep.has(peer)) continue;
        keep.add(peer);
        next.push(peer);
      }
    }
    frontier = next;
  }
  return keep;
}

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

  const withinDepth = hopDistance(graph.root, edges, filters.depth);
  edges = edges.filter(
    (e) => withinDepth.has(e.source) && withinDepth.has(e.target)
  );

  const nodeIds = new Set<string>([graph.root]);
  for (const e of edges) {
    nodeIds.add(e.source);
    nodeIds.add(e.target);
  }
  withinDepth.forEach((id) => nodeIds.add(id));

  const nodes = graph.nodes.filter((n) => {
    if (!nodeIds.has(n.id) && n.id !== graph.root) return false;
    if (n.type === "precompile" && !filters.showPrecompiles) {
      return n.id === graph.root;
    }
    if (n.type !== "precompile" && !filters.nodeTypes.has(n.type)) {
      return n.id === graph.root;
    }
    return true;
  });

  const visible = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => visible.has(e.source) && visible.has(e.target));

  // Heartbeat: collapse only when NOT full-history real txs (keep every real hash)
  const hbKey = new Map<string, GraphEdge>();
  const rest: GraphEdge[] = [];
  for (const e of edges) {
    const realTx =
      e.txHash &&
      /^0x[a-fA-F0-9]{64}$/.test(e.txHash) &&
      !/^0x0+$/i.test(e.txHash);
    if (e.type === "heartbeat" && !realTx) {
      const k = `${e.source}->${e.target}`;
      const prev = hbKey.get(k);
      if (!prev || e.timestamp > prev.timestamp) hbKey.set(k, e);
    } else {
      rest.push(e);
    }
  }
  edges = [...rest, ...Array.from(hbKey.values())];
  edges = edges.filter((e) => e.source !== e.target);

  return { nodes, edges };
}
