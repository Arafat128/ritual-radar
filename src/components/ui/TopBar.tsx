"use client";

import { useEffect, useState } from "react";
import { useGraphStore } from "@/lib/graphStore";

function isAddr(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
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
  const [local, setLocal] = useState(query);

  useEffect(() => setLocal(query), [query]);

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
    const t = setInterval(poll, 12_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [setBlockHeight]);

  function submit(raw: string) {
    const v = raw.trim();
    if (!isAddr(v)) return;
    setQuery(v);
    void loadLive(v);
  }

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
            // paste-detect: auto-submit valid address
            if (isAddr(v)) submit(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(local);
          }}
          placeholder="0x… paste Ritual address"
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white/90 outline-none ring-[#c8ff4a]/30 placeholder:text-white/30 focus:ring-1"
          spellCheck={false}
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => submit(local)}
          className="shrink-0 rounded-xl bg-[#c8ff4a] px-3 py-2 text-xs font-semibold text-black hover:bg-[#d4ff6a] disabled:opacity-50"
        >
          {loading ? "…" : "Scan"}
        </button>
        <button
          type="button"
          onClick={() => loadMock(local || undefined)}
          className="shrink-0 rounded-xl border border-white/15 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
          title="Demo graph with mock edges"
        >
          Demo
        </button>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-white/45">
        <label className="flex items-center gap-2">
          Depth
          <input
            type="range"
            min={1}
            max={3}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="w-20 accent-[#c8ff4a]"
          />
          <span className="font-mono text-white/70">{depth}</span>
        </label>
        <span className="font-mono text-cyan-300/80">
          blk {blockHeight != null ? blockHeight.toLocaleString() : "—"}
        </span>
      </div>
    </header>
  );
}
