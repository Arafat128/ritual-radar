"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

type Props = {
  start: [number, number, number];
  end: [number, number, number];
  value?: number; // 0..1
  active?: boolean;
};

/** Dashed arc with hue-cycling + dash travel (phase 3 — no custom shader yet) */
export function SimpleFlowEdge({
  start,
  end,
  value = 0.5,
  active = true,
}: Props) {
  // drei Line ref is loosely typed across versions
  const ref = useRef<{ material?: THREE.Material | THREE.Material[] } | null>(
    null
  );

  const points = useMemo(() => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const mid = s
      .clone()
      .lerp(e, 0.5)
      .add(new THREE.Vector3(0, s.distanceTo(e) * 0.18, 0));
    const curve = new THREE.QuadraticBezierCurve3(s, mid, e);
    return curve
      .getPoints(24)
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
      mat.dashOffset = -t * (1.2 + value);
    }
    if (mat.color) {
      mat.color.setHSL(
        (t * 0.05 + value * 0.2) % 1,
        0.85,
        active ? 0.55 : 0.28
      );
    }
    if (typeof mat.opacity === "number") {
      mat.opacity = active ? 0.85 : 0.25;
    }
  });

  return (
    <Line
      ref={ref as never}
      points={points}
      lineWidth={1 + value * 4}
      dashed
      dashScale={3.5}
      dashSize={0.35}
      gapSize={0.18}
      transparent
      toneMapped={false}
      depthWrite={false}
    />
  );
}
