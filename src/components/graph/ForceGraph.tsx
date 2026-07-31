"use client";

import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  Stars,
} from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force-3d";
import type { GraphEdge, GraphNode } from "@/lib/graphTypes";
import { normalizeValueWei } from "@/lib/mockGraph";
import { filterGraph, useGraphStore } from "@/lib/graphStore";
import { GraphNodeMesh } from "./GraphNodeMesh";
import { SimpleFlowEdge } from "./SimpleFlowEdge";

function GraphContent() {
  const graph = useGraphStore((s) => s.graph);
  const filters = useGraphStore((s) => s.filters);
  const timelineT = useGraphStore((s) => s.timelineT);
  const selectedId = useGraphStore((s) => s.selectedId);
  const setSelected = useGraphStore((s) => s.setSelected);
  const applyLayoutPositions = useGraphStore((s) => s.applyLayoutPositions);

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    return filterGraph(graph, filters, timelineT);
  }, [graph, filters, timelineT]);

  const layoutKey = useMemo(
    () =>
      `${graph?.root || ""}|${nodes.map((n) => n.id).join(",")}|${edges
        .map((e) => e.id)
        .join(",")}|${filters.depth}`,
    [graph?.root, nodes, edges, filters.depth]
  );

  useEffect(() => {
    if (!nodes.length) return;
    const simNodes = nodes.map((n) => ({
      ...n,
      x: n.x ?? (Math.random() - 0.5) * 4,
      y: n.y ?? (Math.random() - 0.5) * 4,
      z: n.z ?? (Math.random() - 0.5) * 4,
    }));
    const idSet = new Set(simNodes.map((n) => n.id));
    const links = edges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        value: e.value,
      }));

    const sim = forceSimulation(simNodes, 3)
      .force(
        "link",
        forceLink(links)
          .id((d: { id: string }) => d.id)
          .distance(2.4)
          .strength(0.48)
      )
      .force("charge", forceManyBody().strength(-9))
      .force("center", forceCenter(0, 0, 0))
      .stop();

    for (let i = 0; i < 160; i++) sim.tick();

    const positions: Record<string, { x: number; y: number; z: number }> = {};
    for (const n of simNodes) {
      positions[n.id] = {
        x: n.x ?? 0,
        y: n.y ?? 0,
        z: n.z ?? 0,
      };
    }
    if (graph?.root && positions[graph.root]) {
      positions[graph.root] = { x: 0, y: 0, z: 0 };
    }
    applyLayoutPositions(positions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  const maxWei = useMemo(() => {
    let m = BigInt(0);
    for (const e of edges) {
      try {
        const v = BigInt(e.value || "0");
        if (v > m) m = v;
      } catch {
        /* */
      }
    }
    return m > BigInt(0) ? m : BigInt(1);
  }, [edges]);

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const times = edges.map((e) => e.timestamp);
  const tMin = times.length ? Math.min(...times) : 0;
  const tMax = times.length ? Math.max(...times) : 1;

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <fog attach="fog" args={["#050505", 18, 48]} />
      <ambientLight intensity={0.38} />
      <pointLight position={[6, 8, 4]} intensity={1.15} color="#c8ff4a" />
      <pointLight position={[-6, -4, -5]} intensity={0.65} color="#22d3ee" />
      <Stars radius={80} depth={40} count={900} factor={2.8} fade speed={0.35} />

      {edges.map((e) => {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b || a.x == null || b.x == null) return null;
        const start: [number, number, number] = [a.x!, a.y!, a.z!];
        const end: [number, number, number] = [b.x!, b.y!, b.z!];
        const nv = normalizeValueWei(e.value, maxWei);
        const active =
          timelineT >= (e.timestamp - tMin) / Math.max(1, tMax - tMin) - 0.02;
        return (
          <SimpleFlowEdge
            key={e.id}
            start={start}
            end={end}
            value={nv}
            active={active}
            edgeType={e.type}
            live={e.live !== false}
          />
        );
      })}

      {nodes.map((n) => (
        <GraphNodeMesh
          key={n.id}
          node={n}
          isRoot={n.id === graph?.root}
          selected={n.id === selectedId}
          onSelect={setSelected}
        />
      ))}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={2}
        maxDistance={36}
      />
    </>
  );
}

export function ForceGraphCanvas() {
  const loading = useGraphStore((s) => s.loading);
  const graph = useGraphStore((s) => s.graph);
  const loadMock = useGraphStore((s) => s.loadMock);
  const [dpr, setDpr] = useState<[number, number]>([1, 1.5]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    setDpr(mobile ? [1, 1.15] : [1, 1.6]);
  }, []);

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={dpr}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <PerspectiveCamera makeDefault position={[0, 2.5, 9]} fov={50} />
        {graph && <GraphContent />}
      </Canvas>
      {!graph && !loading && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center">
          <div className="glass-panel mx-4 max-w-md space-y-3 p-6 text-center">
            <p className="font-display text-2xl text-[#c8ff4a]">Ritual Radar</p>
            <p className="text-sm text-white/55">
              Paste any Ritual address to map live relationships — EOAs,
              contracts, Sovereign & Persistent agents, value flow.
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => loadMock()}
                className="rounded-xl border border-white/15 px-4 py-2 text-xs text-white/70 hover:bg-white/5"
              >
                Open demo graph
              </button>
            </div>
            <p className="text-[10px] text-white/30">
              Try your wallet, a Rite contract, or a factory on chain 1979
            </p>
          </div>
        </div>
      )}
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/35 backdrop-blur-[2px]">
          <div className="h-20 w-20 animate-pulse rounded-full border border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_40px_rgba(34,211,238,0.25)]" />
          <p className="text-xs text-cyan-100/80">
            Scanning RPC + agent registry…
          </p>
        </div>
      )}
    </div>
  );
}
