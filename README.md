# Ritual Radar

Paste any **Ritual Chain** address (EOA, contract, Sovereign / Persistent agent) → **3D force-directed graph** of connections with animated value-flow along edges.

| | |
|--|--|
| **Live** | [https://ritual-radar.vercel.app](https://ritual-radar.vercel.app) |
| **GitHub** | [Arafat128/ritual-radar](https://github.com/Arafat128/ritual-radar) |

> Not a clone of `agents.ritualfoundation.org` honeycomb roster. This tool traces **relationships and flow** for a specific address.

## Stack

- Next.js 14 + TypeScript + Tailwind
- react-three-fiber / drei — 3D scene
- d3-force-3d — layout
- viem — Ritual RPC
- Zustand — graph state
- framer-motion — panels

## Chain

| | |
|---|---|
| Chain ID | `1979` |
| RPC | `https://rpc.ritualfoundation.org` |
| Explorer | `https://explorer.ritualfoundation.org` |

## Run

```bash
cd ritual-radar
npm install --legacy-peer-deps
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- **Demo** — mock neighborhood (layout + edges work offline)
- **Scan** / paste `0x…` — root node enriched from live RPC + `/api/agents/cache`

## Build phases

| Phase | Status |
|---|---|
| 1 Scaffold + glass design tokens | done |
| 2 Static 3D graph + force layout + shapes | done |
| 3 SimpleFlowEdge (dashed + hue cycle) | done |
| 4 Shader tube connectors | next |
| 5 Full explorer tx proxy + real edges | next |
| 6 Depth expand, more filters polish | next |

## Notes

- Precompiles (e.g. AgentHeartbeat) are **hidden by default** — toggle in the filter bar.
- Heartbeat edges collapse to one arc per pair; self-schedule loops are node rings, not edges.
- Live **edge history** needs reverse-engineered explorer APIs (CORS) — currently mock edges + live root classification.
