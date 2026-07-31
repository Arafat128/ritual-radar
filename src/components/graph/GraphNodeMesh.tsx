"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AgentStatus, GraphNode, NodeType } from "@/lib/graphTypes";
import { AGENT_STATUS_COLOR } from "@/lib/graphTypes";
import { shortAddr } from "@/lib/ritual";

function baseColor(type: NodeType, status?: AgentStatus): string {
  if (status) return AGENT_STATUS_COLOR[status];
  switch (type) {
    case "eoa":
      return "#a3e635";
    case "contract":
      return "#818cf8";
    case "sovereign_agent":
      return "#22d3ee";
    case "persistent_agent":
      return "#38bdf8";
    case "precompile":
      return "#64748b";
    default:
      return "#ffffff";
  }
}

function sizeFor(n: GraphNode, isRoot?: boolean) {
  const t = Math.log10(Math.max(1, n.txCount));
  const base = 0.22 + Math.min(0.55, t * 0.12);
  return isRoot ? base * 1.25 : base;
}

type Props = {
  node: GraphNode;
  isRoot?: boolean;
  selected?: boolean;
  onSelect: (id: string) => void;
};

export function GraphNodeMesh({ node, isRoot, selected, onSelect }: Props) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const color = useMemo(
    () => baseColor(node.type, node.agentStatus),
    [node.type, node.agentStatus]
  );
  const r = sizeFor(node, isRoot);
  const pos: [number, number, number] = [
    node.x ?? 0,
    node.y ?? 0,
    node.z ?? 0,
  ];

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current && (isRoot || node.agentStatus === "reviving")) {
      const s =
        1 + Math.sin(t * (node.agentStatus === "reviving" ? 3 : 2)) * 0.08;
      ring.current.scale.setScalar(s);
      const mat = ring.current.material as THREE.MeshBasicMaterial;
      mat.opacity =
        node.agentStatus === "failed"
          ? 0.15
          : 0.35 + Math.sin(t * 2.5) * 0.15;
    }
    if (group.current && node.type === "sovereign_agent") {
      group.current.rotation.y = t * 0.35;
    }
  });

  const opacity =
    node.agentStatus === "failed" ? 0.32 : node.live === false ? 0.72 : 0.94;

  const mesh = (() => {
    const common = {
      onClick: (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onSelect(node.id);
      },
      onPointerOver: (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      },
      onPointerOut: () => {
        document.body.style.cursor = "default";
      },
    };
    const matProps = {
      color,
      emissive: color,
      emissiveIntensity: selected ? 0.65 : isRoot ? 0.4 : 0.22,
      transparent: true,
      opacity,
      roughness: 0.35,
      metalness: 0.4,
    };
    switch (node.type) {
      case "contract":
        return (
          <mesh {...common}>
            <boxGeometry args={[r * 1.4, r * 1.4, r * 1.4]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
        );
      case "sovereign_agent":
        return (
          <mesh {...common}>
            <octahedronGeometry args={[r, 0]} />
            <meshStandardMaterial {...matProps} metalness={0.55} />
          </mesh>
        );
      case "persistent_agent":
        return (
          <mesh {...common}>
            <icosahedronGeometry args={[r, 0]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
        );
      case "precompile":
        return (
          <mesh {...common}>
            <octahedronGeometry args={[r * 0.55, 0]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.15}
              transparent
              opacity={0.45}
              wireframe
            />
          </mesh>
        );
      default:
        return (
          <mesh {...common}>
            <sphereGeometry args={[r, 20, 20]} />
            <meshStandardMaterial {...matProps} metalness={0.2} />
          </mesh>
        );
    }
  })();

  const showLabel = isRoot || selected || node.type.includes("agent");

  return (
    <group ref={group} position={pos}>
      {mesh}
      {(isRoot || selected) && (
        <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 1.35, r * 1.55, 48]} />
          <meshBasicMaterial
            color={isRoot ? "#c8ff4a" : color}
            transparent
            opacity={0.45}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {(node.type === "persistent_agent" || node.type === "sovereign_agent") &&
        node.agentStatus === "active" && (
          <mesh rotation={[Math.PI / 2.4, 0.2, 0]}>
            <ringGeometry args={[r * 1.7, r * 1.78, 40]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.2}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )}
      {showLabel && (
        <Html
          center
          distanceFactor={10}
          style={{ pointerEvents: "none", userSelect: "none" }}
          position={[0, r + 0.35, 0]}
        >
          <div
            className={`whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[9px] font-medium backdrop-blur-sm ${
              isRoot
                ? "border-[#c8ff4a]/40 bg-black/70 text-[#c8ff4a]"
                : "border-white/15 bg-black/65 text-white/75"
            }`}
          >
            {node.label || shortAddr(node.id, 4)}
          </div>
        </Html>
      )}
    </group>
  );
}
