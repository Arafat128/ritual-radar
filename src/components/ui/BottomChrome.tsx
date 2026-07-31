"use client";

import type { EdgeType, NodeType } from "@/lib/graphTypes";
import { useGraphStore } from "@/lib/graphStore";

const NODE_CHIPS: { id: NodeType; label: string }[] = [
  { id: "eoa", label: "EOA" },
  { id: "contract", label: "Contract" },
  { id: "sovereign_agent", label: "Sovereign" },
  { id: "persistent_agent", label: "Persistent" },
];

const EDGE_CHIPS: { id: EdgeType; label: string }[] = [
  { id: "transfer", label: "Transfer" },
  { id: "call", label: "Call" },
  { id: "async", label: "Async" },
  { id: "scheduled", label: "Scheduled" },
  { id: "heartbeat", label: "Heartbeat" },
];

export function BottomChrome() {
  const filters = useGraphStore((s) => s.filters);
  const toggleNodeType = useGraphStore((s) => s.toggleNodeType);
  const toggleEdgeType = useGraphStore((s) => s.toggleEdgeType);
  const showPrecompiles = filters.showPrecompiles;
  const setShowPrecompiles = useGraphStore((s) => s.setShowPrecompiles);
  const timelineT = useGraphStore((s) => s.timelineT);
  const setTimelineT = useGraphStore((s) => s.setTimelineT);
  const graph = useGraphStore((s) => s.graph);
  const error = useGraphStore((s) => s.error);

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 p-3">
      {error && (
        <p className="pointer-events-auto mb-2 rounded-lg border border-amber-400/30 bg-amber-950/50 px-3 py-1.5 text-[11px] text-amber-100">
          {error}
        </p>
      )}
      <div className="glass-panel pointer-events-auto space-y-3 px-3 py-3">
        <div className="flex flex-wrap gap-1.5">
          {NODE_CHIPS.map((c) => {
            const on = filters.nodeTypes.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleNodeType(c.id)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  on
                    ? "bg-[#c8ff4a]/20 text-[#c8ff4a]"
                    : "border border-white/10 text-white/35"
                }`}
              >
                {c.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowPrecompiles(!showPrecompiles)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
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
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  on
                    ? "bg-cyan-400/20 text-cyan-200"
                    : "border border-white/10 text-white/35"
                }`}
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
          Drag to orbit · scroll zoom · click node for details · heartbeats
          aggregated · precompiles hidden by default
        </p>
      </div>
    </div>
  );
}
