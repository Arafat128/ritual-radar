"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { TopBar } from "@/components/ui/TopBar";
import { DetailPanel } from "@/components/ui/DetailPanel";
import { BottomChrome } from "@/components/ui/BottomChrome";
import { useGraphStore } from "@/lib/graphStore";

const ForceGraphCanvas = dynamic(
  () =>
    import("@/components/graph/ForceGraph").then((m) => m.ForceGraphCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-white/40">
        Loading 3D radar…
      </div>
    ),
  }
);

function isAddr(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

/**
 * Full radar UI. Supports deep links used by Rite:
 *   ?address=0x…     auto live scan
 *   ?demo=1          open demo graph (optional address as root)
 *   ?embed=1         compact chrome for iframe embed
 */
export function RadarApp() {
  const searchParams = useSearchParams();
  const loadLive = useGraphStore((s) => s.loadLive);
  const loadMock = useGraphStore((s) => s.loadMock);
  const setEmbedMode = useGraphStore((s) => s.setEmbedMode);
  const setFullHistory = useGraphStore((s) => s.setFullHistory);
  const fullHistory = useGraphStore((s) => s.fullHistory);
  const graph = useGraphStore((s) => s.graph);

  const address = (searchParams.get("address") || "").trim();
  const demo = searchParams.get("demo") === "1";
  const embed =
    searchParams.get("embed") === "1" || searchParams.get("embed") === "true";
  const fullParam =
    searchParams.get("full") === "1" || searchParams.get("full") === "true";

  const bootKey = useMemo(
    () =>
      `${demo ? "d" : "l"}:${address.toLowerCase()}:${embed ? "e" : "f"}:${
        fullParam ? "F" : "n"
      }`,
    [address, demo, embed, fullParam]
  );

  // Embed vs full site + optional full-tx enable (never in embed)
  useEffect(() => {
    setEmbedMode(embed);
    if (embed) return;
    if (fullParam) setFullHistory(true);
  }, [embed, fullParam, setEmbedMode, setFullHistory]);

  useEffect(() => {
    if (demo) {
      loadMock(isAddr(address) ? address : undefined);
      return;
    }
    if (isAddr(address)) {
      void loadLive(address, {
        fullHistory: embed ? false : fullParam || undefined,
      });
    }
    // Only re-run when deep-link identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootKey]);

  // Keep URL in sync when user scans a new address (shareable / Rite handoff)
  useEffect(() => {
    if (!graph?.root || typeof window === "undefined") return;
    if (graph.source === "mock") return;
    if (!isAddr(graph.root)) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("address", graph.root);
      if (embed) {
        url.searchParams.set("embed", "1");
        url.searchParams.delete("full");
      } else if (fullHistory) {
        url.searchParams.set("full", "1");
      } else {
        url.searchParams.delete("full");
      }
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }, [graph?.root, graph?.source, embed, fullHistory]);

  return (
    <main
      className={`radar-grid relative h-dvh w-full overflow-hidden ${
        embed ? "embed-mode" : ""
      }`}
      data-embed={embed ? "1" : "0"}
    >
      {embed && (
        <div className="pointer-events-none absolute left-3 top-2 z-30 rounded-full border border-cyan-400/25 bg-black/50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-200/90">
          Ritual Radar · embedded
        </div>
      )}
      <div
        className={`absolute left-0 right-0 top-0 z-20 ${
          embed ? "p-2 pt-7" : "p-3"
        }`}
      >
        <TopBar compact={embed} />
      </div>
      <div className="absolute inset-0 z-0">
        <ForceGraphCanvas />
      </div>
      <DetailPanel />
      <BottomChrome compact={embed} />
    </main>
  );
}
