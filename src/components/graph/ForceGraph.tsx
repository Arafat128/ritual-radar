"use client";

import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  Stars,
} from "@react-three/drei";
import { useEffect, useMemo } from "react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
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

  // Run force layout when graph membership changes
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
          .distance(2.2)
          .strength(0.45)
      )
      .force("charge", forceManyBody().strength(-8))
      .force("center", forceCenter(0, 0, 0))
      .stop();

    for (let i = 0; i < 180; i++) sim.tick();

    const positions: Record<string, { x: number; y: number; z: number }> = {};
    for (const n of simNodes) {
      positions[n.id] = {
        x: n.x ?? 0,
        y: n.y ?? 0,
        z: n.z ?? 0,
      };
    }
    // Pin root near origin
    if (graph?.root && positions[graph.root]) {
      positions[graph.root] = { x: 0, y: 0, z: 0 };
    }
    applyLayoutPositions(positions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph?.root, nodes.map((n) => n.id).join(","), edges.map((e) => e.id).join(",")]);

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
      <ambientLight intensity={0.35} />
      <pointLight position={[6, 8, 4]} intensity={1.1} color="#c8ff4a" />
      <pointLight position={[-6, -4, -5]} intensity={0.6} color="#22d3ee" />
      <Stars radius={80} depth={40} count={1200} factor={3} fade speed={0.4} />

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
        maxDistance={40}
      />
    </>
  );
}

export function ForceGraphCanvas() {
  const loading = useGraphStore((s) => s.loading);
  const graph = useGraphStore((s) => s.graph);

  return (
    <div className="relative h-full w-full">
      <Canvas dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
        <PerspectiveCamera makeDefault position={[0, 2.5, 9]} fov={50} />
        {graph && <GraphContent />}
      </Canvas>
      {!graph && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-white/40">
            Paste a Ritual address to open the radar
          </p>
        </div>
      )}
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="h-24 w-24 animate-pulse rounded-full border border-cyan-400/30 bg-cyan-400/5" />
        </div>
      )}
    </div>
  );
}
