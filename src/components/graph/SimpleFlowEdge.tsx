"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { EdgeType } from "@/lib/graphTypes";
import { EDGE_TYPE_COLOR } from "@/lib/graphTypes";

type Props = {
  start: [number, number, number];
  end: [number, number, number];
  value?: number; // 0..1
  active?: boolean;
  edgeType?: EdgeType;
  live?: boolean;
};

/** Dashed flow arc — color by edge type, subtle motion */
export function SimpleFlowEdge({
  start,
  end,
  value = 0.5,
  active = true,
  edgeType = "call",
  live = true,
}: Props) {
  const ref = useRef<{ material?: THREE.Material | THREE.Material[] } | null>(
    null
  );
  const base = EDGE_TYPE_COLOR[edgeType] || "#22d3ee";

  const points = useMemo(() => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const mid = s
      .clone()
      .lerp(e, 0.5)
      .add(new THREE.Vector3(0, s.distanceTo(e) * 0.18, 0));
    const curve = new THREE.QuadraticBezierCurve3(s, mid, e);
    return curve
      .getPoints(20)
      .map((p) => [p.x, p.y, p.z] as [number, number, number]);
  }, [start, end]);

  useFrame((state) => {
    const line = ref.current;
    const raw = line?.material;
    if (!raw) return;
    const mat = (Array.isArray(raw) ? raw[0] : raw) as THREE.Material & {
      dashOffset?: number;
      color?: THREE.Color;
      opacity?: number;
    };
    const t = state.clock.elapsedTime;
    if (typeof mat.dashOffset === "number") {
      mat.dashOffset = -t * (0.9 + value * 0.8);
    }
    if (mat.color) {
      // slight pulse around base type color
      const c = new THREE.Color(base);
      const pulse = 0.92 + Math.sin(t * 2 + value) * 0.08;
      mat.color.copy(c).multiplyScalar(pulse);
    }
    if (typeof mat.opacity === "number") {
      const baseOp = live ? 0.88 : 0.42;
      mat.opacity = active ? baseOp : baseOp * 0.35;
    }
  });

  return (
    <Line
      ref={ref as never}
      points={points}
      lineWidth={1 + value * 3.5}
      dashed
      dashScale={3.2}
      dashSize={0.32}
      gapSize={0.16}
      color={base}
      transparent
      toneMapped={false}
      depthWrite={false}
      opacity={live ? 0.85 : 0.4}
    />
  );
}
