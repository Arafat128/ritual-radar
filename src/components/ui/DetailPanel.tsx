"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import { formatEther } from "viem";
import { NODE_TYPE_LABEL } from "@/lib/graphTypes";
import { explorerAddressUrl, shortAddr } from "@/lib/ritual";
import { useGraphStore } from "@/lib/graphStore";

export function DetailPanel() {
  const graph = useGraphStore((s) => s.graph);
  const selectedId = useGraphStore((s) => s.selectedId);
  const setSelected = useGraphStore((s) => s.setSelected);

  const node = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedId) ?? null,
    [graph, selectedId]
  );

  const connections = useMemo(() => {
    if (!graph || !selectedId) return [];
    const rows: { peer: string; value: bigint; type: string }[] = [];
    for (const e of graph.edges) {
      if (e.source !== selectedId && e.target !== selectedId) continue;
      const peer = e.source === selectedId ? e.target : e.source;
      let value = BigInt(0);
      try {
        value = BigInt(e.value || "0");
      } catch {
        /* */
      }
      rows.push({ peer, value, type: e.type });
    }
    rows.sort((a, b) => (a.value < b.value ? 1 : -1));
    return rows.slice(0, 8);
  }, [graph, selectedId]);

  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.22 }}
          className="glass-panel absolute right-3 top-20 z-20 flex w-[min(100%,320px)] flex-col gap-3 p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-display text-lg text-white/90">
                {node.label || shortAddr(node.id, 6)}
              </p>
              <p className="mt-0.5 break-all font-mono text-[10px] text-white/40">
                {node.id}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-white/40 hover:text-white/70"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
              {NODE_TYPE_LABEL[node.type]}
            </span>
            {node.agentStatus && (
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-cyan-200">
                {node.agentStatus}
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <dt className="text-white/35">Balance</dt>
              <dd className="font-mono text-white/80">
                {node.balance != null
                  ? `${Number(formatEther(BigInt(node.balance))).toFixed(4)} RIT`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-white/35">Tx count</dt>
              <dd className="font-mono text-white/80">{node.txCount}</dd>
            </div>
            <div>
              <dt className="text-white/35">First seen</dt>
              <dd className="font-mono text-white/80">
                {node.firstSeen ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-white/35">Last seen</dt>
              <dd className="font-mono text-white/80">
                {node.lastSeen ?? "—"}
              </dd>
            </div>
          </dl>

          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/35">
              Top connections
            </p>
            <ul className="space-y-1">
              {connections.length === 0 && (
                <li className="text-[11px] text-white/40">No edges in view</li>
              )}
              {connections.map((c) => (
                <li
                  key={c.peer + c.type}
                  className="flex items-center justify-between gap-2 font-mono text-[10px] text-white/65"
                >
                  <button
                    type="button"
                    className="truncate text-left hover:text-[#c8ff4a]"
                    onClick={() => setSelected(c.peer)}
                  >
                    {shortAddr(c.peer)}
                  </button>
                  <span className="shrink-0 text-white/35">{c.type}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(node.id)}
              className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] text-white/70 hover:bg-white/5"
            >
              Copy
            </button>
            <a
              href={explorerAddressUrl(node.id)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-[#c8ff4a]/90 px-2.5 py-1.5 text-[11px] font-semibold text-black hover:bg-[#d4ff6a]"
            >
              Open explorer ↗
            </a>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
