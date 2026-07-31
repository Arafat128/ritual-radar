"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import { formatEther } from "viem";
import { NODE_TYPE_LABEL } from "@/lib/graphTypes";
import {
  explorerAddressUrl,
  explorerTxUrl,
  shortAddr,
} from "@/lib/ritual";
import { useGraphStore } from "@/lib/graphStore";

export function DetailPanel() {
  const graph = useGraphStore((s) => s.graph);
  const selectedId = useGraphStore((s) => s.selectedId);
  const setSelected = useGraphStore((s) => s.setSelected);
  const loadLive = useGraphStore((s) => s.loadLive);
  const loadMock = useGraphStore((s) => s.loadMock);

  const node = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedId) ?? null,
    [graph, selectedId]
  );

  /** Demo graph: re-root mock topology. Live graph: fetch chain data for peer. */
  const isDemoContext =
    graph?.source === "mock" || node?.live === false;

  const connections = useMemo(() => {
    if (!graph || !selectedId) return [];
    const rows: {
      peer: string;
      value: bigint;
      type: string;
      txHash: string;
      live?: boolean;
    }[] = [];
    for (const e of graph.edges) {
      if (e.source !== selectedId && e.target !== selectedId) continue;
      const peer = e.source === selectedId ? e.target : e.source;
      let value = BigInt(0);
      try {
        value = BigInt(e.value || "0");
      } catch {
        /* */
      }
      rows.push({
        peer,
        value,
        type: e.type,
        txHash: e.txHash,
        live: e.live,
      });
    }
    rows.sort((a, b) => (a.value < b.value ? 1 : -1));
    return rows.slice(0, 10);
  }, [graph, selectedId]);

  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.22 }}
          className="glass-panel absolute right-3 top-20 z-20 flex max-h-[min(70vh,520px)] w-[min(100%,320px)] flex-col gap-3 overflow-y-auto p-4"
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
              aria-label="Close"
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
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                node.live
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/5 text-white/40"
              }`}
            >
              {node.live ? "on-chain" : "demo"}
            </span>
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
              <dt className="text-white/35">Tx / nonce</dt>
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
                  key={c.peer + c.type + c.txHash}
                  className="flex items-center justify-between gap-2 font-mono text-[10px] text-white/65"
                >
                  <button
                    type="button"
                    className="truncate text-left hover:text-[#c8ff4a]"
                    onClick={() => setSelected(c.peer)}
                  >
                    {shortAddr(c.peer)}
                  </button>
                  <span className="flex shrink-0 items-center gap-1 text-white/35">
                    {c.live === false && (
                      <span className="text-white/25">demo</span>
                    )}
                    {c.type}
                    {c.txHash && !c.txHash.match(/^0x([0a-f])\1+$/i) && (
                      <a
                        href={explorerTxUrl(c.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-300/70 hover:text-cyan-200"
                        title="Open tx"
                      >
                        ↗
                      </a>
                    )}
                  </span>
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
            <button
              type="button"
              onClick={() => {
                if (isDemoContext) {
                  // Stay in demo: re-root synthetic graph so connections remain
                  loadMock(node.id);
                } else {
                  void loadLive(node.id);
                }
              }}
              className="rounded-lg border border-cyan-400/30 px-2.5 py-1.5 text-[11px] text-cyan-200 hover:bg-cyan-400/10"
              title={
                isDemoContext
                  ? "Re-center the demo graph on this address (keeps demo edges)"
                  : "Fetch live on-chain graph for this address"
              }
            >
              {isDemoContext ? "Focus peer" : "Scan live"}
            </button>
            {isDemoContext && (
              <button
                type="button"
                onClick={() => void loadLive(node.id)}
                className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] text-white/55 hover:bg-white/5"
                title="Query Ritual RPC for this address (may have few/no edges if inactive)"
              >
                Try live
              </button>
            )}
            <a
              href={explorerAddressUrl(node.id)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-[#c8ff4a]/90 px-2.5 py-1.5 text-[11px] font-semibold text-black hover:bg-[#d4ff6a]"
            >
              Explorer ↗
            </a>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
