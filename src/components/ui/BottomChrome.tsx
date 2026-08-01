"use client";

import type { EdgeType, NodeType } from "@/lib/graphTypes";
import { useGraphStore } from "@/lib/graphStore";

const NODE_CHIPS: { id: NodeType; label: string }[] = [
  { id: "eoa", label: "EOA" },
  { id: "contract", label: "Contract" },
  { id: "sovereign_agent", label: "Sovereign" },
  { id: "persistent_agent", label: "Persistent" },
];

const EDGE_CHIPS: { id: EdgeType; label: string; color: string }[] = [
  { id: "transfer", label: "Transfer", color: "#c8ff4a" },
  { id: "call", label: "Call", color: "#818cf8" },
  { id: "async", label: "Async", color: "#22d3ee" },
  { id: "scheduled", label: "Scheduled", color: "#f472b6" },
  { id: "heartbeat", label: "Heartbeat", color: "#94a3b8" },
];

export function BottomChrome({ compact = false }: { compact?: boolean }) {
  const filters = useGraphStore((s) => s.filters);
  const toggleNodeType = useGraphStore((s) => s.toggleNodeType);
  const toggleEdgeType = useGraphStore((s) => s.toggleEdgeType);
  const showPrecompiles = filters.showPrecompiles;
  const setShowPrecompiles = useGraphStore((s) => s.setShowPrecompiles);
  const timelineT = useGraphStore((s) => s.timelineT);
  const setTimelineT = useGraphStore((s) => s.setTimelineT);
  const graph = useGraphStore((s) => s.graph);
  const error = useGraphStore((s) => s.error);
  const meta = useGraphStore((s) => s.meta);

  const liveEdges = graph?.edges.filter((e) => e.live !== false).length ?? 0;
  const mockEdges = graph?.edges.filter((e) => e.live === false).length ?? 0;

  return (
    <div
      className={`pointer-events-none absolute bottom-0 left-0 right-0 z-20 ${
        compact ? "p-2" : "p-3"
      }`}
    >
      {error && (
        <p className="pointer-events-auto mb-2 rounded-lg border border-amber-400/30 bg-amber-950/60 px-3 py-1.5 text-[11px] text-amber-100">
          {error}
        </p>
      )}
      {!compact && graph?.note && graph.source !== "mock" && (
        <p className="pointer-events-auto mb-2 max-w-3xl rounded-lg border border-cyan-400/20 bg-cyan-950/40 px-3 py-1.5 text-[11px] text-cyan-100/90">
          {graph.note}
        </p>
      )}
      {!compact && graph?.source === "mock" && (
        <p className="pointer-events-auto mb-2 max-w-3xl rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-[11px] text-white/55">
          Demo mode — edges and peers are synthetic. Press{" "}
          <strong className="text-white/80">Scan</strong> on a real address for
          RPC + agent registry data.
        </p>
      )}
      <div
        className={`glass-panel pointer-events-auto space-y-2 px-3 py-2 sm:space-y-3 sm:py-3 ${
          compact ? "max-h-[38vh] overflow-y-auto" : ""
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/40">
          {graph && (
            <>
              <span className="font-mono text-white/55">
                {graph.nodes.length} nodes · {graph.edges.length} edges
              </span>
              {graph.source !== "mock" && (
                <span className="font-mono text-emerald-300/70">
                  {liveEdges} live
                  {mockEdges > 0 ? ` · ${mockEdges} demo` : ""}
                </span>
              )}
              {meta?.blocksScanned != null && graph.source !== "mock" && (
                <span className="hidden font-mono sm:inline">
                  scanned {meta.blocksScanned} blocks · agents{" "}
                  {meta.persistentCount ?? "—"}P/{meta.sovereignCount ?? "—"}S
                  {meta.fullHistory
                    ? ` · full tx (${meta.realTxCount ?? 0})`
                    : ""}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {NODE_CHIPS.map((c) => {
            const on = filters.nodeTypes.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleNodeType(c.id)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                  on
                    ? "bg-[#c8ff4a]/20 text-[#c8ff4a]"
                    : "border border-white/10 text-white/35 hover:border-white/20"
                }`}
              >
                {c.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowPrecompiles(!showPrecompiles)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
              showPrecompiles
                ? "bg-slate-400/25 text-slate-200"
                : "border border-white/10 text-white/35"
            }`}
          >
            Precompiles
          </button>
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:inline" />
          {EDGE_CHIPS.map((c) => {
            const on = filters.edgeTypes.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleEdgeType(c.id)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                  on ? "text-white/90" : "border border-white/10 text-white/35"
                }`}
                style={
                  on
                    ? {
                        backgroundColor: `${c.color}22`,
                        color: c.color,
                        boxShadow: `inset 0 0 0 1px ${c.color}44`,
                      }
                    : undefined
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-white/35">
            Timeline
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(timelineT * 1000)}
            onChange={(e) => setTimelineT(Number(e.target.value) / 1000)}
            className="w-full accent-cyan-400"
            disabled={!graph}
          />
          <span className="w-10 shrink-0 font-mono text-[10px] text-white/50">
            {Math.round(timelineT * 100)}%
          </span>
        </div>
        <p className="text-[10px] text-white/30">
          Drag orbit · scroll zoom · click node · depth = hop limit · precompiles
          hidden by default · heartbeats aggregated
        </p>
      </div>
    </div>
  );
}
