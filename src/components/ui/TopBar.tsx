"use client";

import { useEffect, useRef, useState } from "react";
import { useGraphStore } from "@/lib/graphStore";

function isAddr(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

function sourceBadge(
  source: string | undefined
): { label: string; className: string } {
  if (source === "live")
    return {
      label: "LIVE",
      className: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    };
  if (source === "live_partial")
    return {
      label: "LIVE · sparse",
      className: "bg-amber-400/15 text-amber-200 border-amber-400/30",
    };
  if (source === "mock")
    return {
      label: "DEMO",
      className: "bg-white/10 text-white/55 border-white/15",
    };
  return {
    label: "—",
    className: "bg-white/5 text-white/40 border-white/10",
  };
}

export function TopBar() {
  const query = useGraphStore((s) => s.query);
  const setQuery = useGraphStore((s) => s.setQuery);
  const loadLive = useGraphStore((s) => s.loadLive);
  const loadMock = useGraphStore((s) => s.loadMock);
  const loading = useGraphStore((s) => s.loading);
  const blockHeight = useGraphStore((s) => s.blockHeight);
  const setBlockHeight = useGraphStore((s) => s.setBlockHeight);
  const depth = useGraphStore((s) => s.filters.depth);
  const setDepth = useGraphStore((s) => s.setDepth);
  const graph = useGraphStore((s) => s.graph);
  const autoRefresh = useGraphStore((s) => s.autoRefresh);
  const setAutoRefresh = useGraphStore((s) => s.setAutoRefresh);
  const rootLive = useGraphStore((s) => s.rootLive);
  const lastRefreshAt = useGraphStore((s) => s.lastRefreshAt);
  const [local, setLocal] = useState(query);
  const lastAuto = useRef("");

  useEffect(() => setLocal(query), [query]);

  // Chain head pulse
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/block", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data.blockNumber != null) {
          setBlockHeight(Number(data.blockNumber));
        }
      } catch {
        /* ignore */
      }
    };
    void poll();
    const t = setInterval(poll, 8_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [setBlockHeight]);

  // Auto-refresh live graph
  const graphRoot = graph?.root;
  const graphSource = graph?.source;
  useEffect(() => {
    if (!autoRefresh) return;
    if (!graphRoot || graphSource === "mock") return;
    if (!isAddr(graphRoot)) return;
    const t = setInterval(() => {
      void loadLive(graphRoot, { silent: true });
    }, 28_000);
    return () => clearInterval(t);
  }, [autoRefresh, graphRoot, graphSource, loadLive]);

  function submit(raw: string) {
    const v = raw.trim();
    if (!isAddr(v)) return;
    const key = v.toLowerCase();
    if (loading && lastAuto.current === key) return;
    lastAuto.current = key;
    setQuery(v);
    void loadLive(v);
  }

  const badge = sourceBadge(graph?.source);
  const ageSec =
    lastRefreshAt != null
      ? Math.max(0, Math.round((Date.now() - lastRefreshAt) / 1000))
      : null;

  return (
    <header className="glass-panel flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex items-baseline gap-2">
        <h1 className="font-display text-xl tracking-tight text-[#c8ff4a]">
          Ritual Radar
        </h1>
        <span className="hidden text-[10px] uppercase tracking-widest text-white/35 sm:inline">
          3D relationship graph · chain 1979
        </span>
      </div>

      <div className="flex min-w-[220px] flex-1 items-center gap-2">
        <input
          value={local}
          onChange={(e) => {
            const v = e.target.value;
            setLocal(v);
            // paste / complete address only (avoid keystroke spam)
            if (isAddr(v) && v.toLowerCase() !== lastAuto.current) {
              submit(v);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (isAddr(text)) {
              e.preventDefault();
              setLocal(text.trim());
              submit(text);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(local);
          }}
          placeholder="0x… paste Ritual address"
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white/90 outline-none ring-[#c8ff4a]/30 placeholder:text-white/30 focus:ring-1"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => submit(local)}
          className="shrink-0 rounded-xl bg-[#c8ff4a] px-3 py-2 text-xs font-semibold text-black hover:bg-[#d4ff6a] disabled:opacity-50"
        >
          {loading ? "Scanning…" : "Scan"}
        </button>
        <button
          type="button"
          onClick={() => loadMock(local || undefined)}
          className="shrink-0 rounded-xl border border-white/15 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
          title="Offline demo graph — not chain data"
        >
          Demo
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
        >
          {badge.label}
        </span>
        {rootLive?.balanceRit != null && graph?.source !== "mock" && (
          <span className="hidden font-mono text-white/60 sm:inline">
            {Number(rootLive.balanceRit).toFixed(4)} RIT
          </span>
        )}
        <label className="flex items-center gap-2">
          Depth
          <input
            type="range"
            min={1}
            max={3}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="w-16 accent-[#c8ff4a]"
          />
          <span className="font-mono text-white/70">{depth}</span>
        </label>
        <label className="flex items-center gap-1.5" title="Refresh live graph ~28s">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-cyan-400"
          />
          <span className="hidden sm:inline">Live</span>
        </label>
        <span className="flex items-center gap-1.5 font-mono text-cyan-300/90">
          <span
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"
            aria-hidden
          />
          blk {blockHeight != null ? blockHeight.toLocaleString() : "—"}
        </span>
        {ageSec != null && graph && (
          <span className="hidden font-mono text-white/30 md:inline">
            {ageSec < 5 ? "just now" : `${ageSec}s ago`}
          </span>
        )}
      </div>
    </header>
  );
}
