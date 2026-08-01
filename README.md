# Ritual Radar

Paste any **Ritual Chain** address (EOA, contract, Sovereign / Persistent agent) → **3D force-directed graph** of connections with animated value-flow along edges.

| | |
|--|--|
| **Live** | [https://ritual-radar.vercel.app](https://ritual-radar.vercel.app) |
| **GitHub** | [Arafat128/ritual-radar](https://github.com/Arafat128/ritual-radar) |
| **Used by** | [Rite Research](https://rite-woad.vercel.app) (deep links + iframe embed) |

### Deep links (for Rite & others)

| Query | Effect |
|-------|--------|
| `?address=0x…` | Auto live scan of that address |
| `?embed=1` | Compact chrome for iframe embed (**no full tx mode**) |
| `?demo=1` | Open demo graph (`address` optional as root) |
| `?full=1` | Enable **Full tx history** (Radar website only) |

Example embed:  
`https://ritual-radar.vercel.app/?address=0x50a3…&embed=1`

### Full tx history (opt-in)

On the **Ritual Radar website only** (not Rite embeds), toggle **Full tx** in the top bar (or `?full=1`).

- Deep-scans recent Ritual blocks for **every** tx involving the address  
- Draws each interaction as a graph edge with an **explorer tx link**  
- Side panel lists OUT/IN transfers + method id + block  
- Preference stored in `localStorage`  
- Embeds always stay on light scan (performance + product rule)

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

## Data sources (honest model)

| Layer | Source | Live? |
|---|---|---|
| Root balance / code / nonce | Ritual RPC | yes |
| Chain head (`blk`) | `/api/block` every ~8s | yes |
| Agent ownership / heartbeats | `explorer…/api/agents/cache` | yes |
| Recent peers | last ~48 blocks of txs involving address | yes (windowed) |
| Demo graph | client mock | no |

Explorer does **not** expose a public full tx-history API (no Blockscout-style `txlist`). Edges outside the recent-block window or agent registry are not invented.

## Build phases

| Phase | Status |
|---|---|
| 1 Scaffold + glass design tokens | done |
| 2 Static 3D graph + force layout + shapes | done |
| 3 SimpleFlowEdge (typed colors + motion) | done |
| 4 Live graph: agents + block scan + honesty badges | done |
| 5 Shader tube connectors | next |
| 6 Deeper history if explorer APIs open | next |

## Notes

- Precompiles (e.g. AgentHeartbeat) are **hidden by default** — toggle in the filter bar.
- Heartbeat edges collapse to one arc per pair.
- **Demo** is synthetic; **Scan** is live. Auto-refresh reloads live graphs ~28s.
- Depth slider = hop limit from root.
