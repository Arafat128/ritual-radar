import {
  createPublicClient,
  formatEther,
  http,
  type Address,
  type Hash,
  type Transaction,
} from "viem";
import type {
  AgentStatus,
  GraphData,
  GraphEdge,
  GraphNode,
  NodeType,
} from "@/lib/graphTypes";
import { KNOWN_CONTRACTS } from "@/lib/knownContracts";
import { PRECOMPILE_HINTS, RPC_URL } from "@/lib/ritual";

const HEARTBEAT = "0xef505e801f1db392b5289690e2ffc20e840a3aca";
const AGENTS_CACHE =
  "https://explorer.ritualfoundation.org/api/agents/cache";

/** How many recent blocks to scan for txs (Ritual ~0.35s/block). */
const BLOCK_SCAN = Number(process.env.RADAR_BLOCK_SCAN || 48);
const SCAN_CONCURRENCY = 12;

type PersistentEntry = {
  address?: string;
  info?: {
    agentAddress?: string;
    owner?: string;
    state?: string;
    isAlive?: boolean;
    lastHeartbeatBlock?: number;
    lastExecutor?: string;
  };
};

type SovereignEntry = {
  address?: string;
  lastActivityBlock?: number;
  owner?: string;
};

export type LiveGraphResult = {
  graph: GraphData;
  rootLive: {
    address: string;
    type: NodeType;
    agentStatus?: AgentStatus;
    balance: string;
    balanceRit: string;
    hasCode: boolean;
    txCount: number;
  };
  meta: {
    agentCacheOk: boolean;
    persistentCount: number;
    sovereignCount: number;
    blocksScanned: number;
    liveEdges: number;
    scanWindowBlocks: number;
  };
};

function nodeId(a: string) {
  return a.toLowerCase();
}

function statusFromPersistent(info?: PersistentEntry["info"]): AgentStatus {
  const st = String(info?.state || "").toUpperCase();
  if (st.includes("FAIL") || info?.isAlive === false) return "failed";
  if (st.includes("REVIV") || st.includes("COOL")) return "reviving";
  return "active";
}

function labelFor(addr: string, fallback?: string) {
  const id = nodeId(addr);
  return (
    PRECOMPILE_HINTS[id] ||
    KNOWN_CONTRACTS[id] ||
    fallback ||
    undefined
  );
}

function ensureNode(
  map: Map<string, GraphNode>,
  id: string,
  partial: Partial<GraphNode> & { type: NodeType }
) {
  const key = nodeId(id);
  const prev = map.get(key);
  if (!prev) {
    map.set(key, {
      id: key,
      type: partial.type,
      label: partial.label || labelFor(key),
      agentStatus: partial.agentStatus,
      balance: partial.balance,
      txCount: partial.txCount ?? 0,
      firstSeen: partial.firstSeen,
      lastSeen: partial.lastSeen,
      live: partial.live ?? true,
    });
    return;
  }
  map.set(key, {
    ...prev,
    type: partial.type || prev.type,
    label: partial.label || prev.label || labelFor(key),
    agentStatus: partial.agentStatus ?? prev.agentStatus,
    balance: partial.balance ?? prev.balance,
    txCount: Math.max(prev.txCount, partial.txCount ?? 0),
    firstSeen:
      partial.firstSeen != null
        ? Math.min(prev.firstSeen ?? partial.firstSeen, partial.firstSeen)
        : prev.firstSeen,
    lastSeen: Math.max(prev.lastSeen ?? 0, partial.lastSeen ?? 0) || prev.lastSeen,
    live: prev.live || partial.live,
  });
}

function pushEdge(
  edges: GraphEdge[],
  seen: Set<string>,
  e: Omit<GraphEdge, "id"> & { id?: string }
) {
  const src = nodeId(e.source);
  const tgt = nodeId(e.target);
  if (src === tgt) return;
  const id =
    e.id ||
    `${e.type}:${src.slice(0, 10)}:${tgt.slice(0, 10)}:${e.txHash?.slice(0, 14) || e.timestamp}`;
  if (seen.has(id)) return;
  seen.add(id);
  edges.push({
    id,
    source: src,
    target: tgt,
    type: e.type,
    value: e.value || "0",
    timestamp: e.timestamp,
    txHash: e.txHash || ("0x" + "0".repeat(64)),
    live: e.live ?? true,
  });
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return out;
}

function classifyTx(
  from: string,
  to: string | null,
  value: bigint
): GraphEdge["type"] {
  if (to && PRECOMPILE_HINTS[to]) return "async";
  if (to === HEARTBEAT) return "heartbeat";
  if (to === "0x56e776bae2dd60664b69bd5f865f1180ffb7d58b") return "scheduled";
  if (value > BigInt(0)) return "transfer";
  return "call";
}

export async function buildLiveGraph(rootInput: string): Promise<LiveGraphResult> {
  const root = nodeId(rootInput);
  const client = createPublicClient({
    transport: http(RPC_URL, {
      timeout: 18_000,
      retryCount: 3,
      retryDelay: 350,
    }),
  });

  const [blockNumber, balance, code, nonce] = await Promise.all([
    client.getBlockNumber(),
    client.getBalance({ address: root as Address }),
    client.getBytecode({ address: root as Address }),
    client.getTransactionCount({ address: root as Address }),
  ]);

  const blockHeight = Number(blockNumber);
  const hasCode = Boolean(code && code !== "0x");
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeSeen = new Set<string>();

  let rootType: NodeType = hasCode ? "contract" : "eoa";
  let agentStatus: AgentStatus | undefined;
  let rootLabel = labelFor(root, hasCode ? "Contract" : "EOA");

  if (PRECOMPILE_HINTS[root] || root.startsWith("0x0000000000000000000000000000000000000")) {
    if (PRECOMPILE_HINTS[root] || KNOWN_CONTRACTS[root]) {
      rootType = PRECOMPILE_HINTS[root] ? "precompile" : rootType;
    }
  }
  if (PRECOMPILE_HINTS[root]) {
    rootType = "precompile";
    rootLabel = PRECOMPILE_HINTS[root];
  }

  // --- Agent cache (real relationships) ---
  let agentCacheOk = false;
  let persistentCount = 0;
  let sovereignCount = 0;
  let cache: { persistent?: PersistentEntry[]; sovereign?: SovereignEntry[] } =
    {};

  try {
    const cacheRes = await fetch(AGENTS_CACHE, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "application/json" },
    });
    if (cacheRes.ok) {
      cache = (await cacheRes.json()) as typeof cache;
      agentCacheOk = true;
      persistentCount = cache.persistent?.length ?? 0;
      sovereignCount = cache.sovereign?.length ?? 0;
    }
  } catch {
    /* optional */
  }

  const persistent = cache.persistent || [];
  const sovereign = cache.sovereign || [];

  // Match root as persistent agent
  const asPersistent = persistent.find((x) => {
    const a = nodeId(x.address || x.info?.agentAddress || "");
    return a === root;
  });
  if (asPersistent) {
    rootType = "persistent_agent";
    agentStatus = statusFromPersistent(asPersistent.info);
    rootLabel = "Persistent agent";
    const owner = asPersistent.info?.owner
      ? nodeId(asPersistent.info.owner)
      : null;
    if (owner) {
      ensureNode(nodes, owner, {
        type: "eoa",
        label: "Owner",
        live: true,
        lastSeen: asPersistent.info?.lastHeartbeatBlock,
        txCount: 0,
      });
      pushEdge(edges, edgeSeen, {
        source: owner,
        target: root,
        type: "call",
        value: "0",
        timestamp: Date.now() - 60_000,
        txHash: "0x" + "a".repeat(64),
        live: true,
      });
    }
    const exec = asPersistent.info?.lastExecutor
      ? nodeId(asPersistent.info.lastExecutor)
      : null;
    if (exec) {
      ensureNode(nodes, exec, {
        type: "eoa",
        label: "Last executor",
        live: true,
        lastSeen: asPersistent.info?.lastHeartbeatBlock,
      });
      pushEdge(edges, edgeSeen, {
        source: root,
        target: exec,
        type: "async",
        value: "0",
        timestamp: Date.now() - 30_000,
        txHash: "0x" + "b".repeat(64),
        live: true,
      });
    }
    ensureNode(nodes, HEARTBEAT, {
      type: "precompile",
      label: "AgentHeartbeat",
      live: true,
      lastSeen: asPersistent.info?.lastHeartbeatBlock,
      txCount: persistentCount,
    });
    pushEdge(edges, edgeSeen, {
      source: root,
      target: HEARTBEAT,
      type: "heartbeat",
      value: "0",
      timestamp: Date.now() - 15_000,
      txHash: "0x" + "c".repeat(64),
      live: true,
    });
  }

  // Match root as sovereign agent
  const asSovereign = sovereign.find((x) => nodeId(x.address || "") === root);
  if (asSovereign) {
    rootType = "sovereign_agent";
    agentStatus = agentStatus || "active";
    rootLabel = "Sovereign agent";
  }

  // Agents owned by root (or owner matches)
  const ownedPersistent = persistent.filter(
    (x) => nodeId(x.info?.owner || "") === root
  );
  for (const p of ownedPersistent.slice(0, 12)) {
    const id = nodeId(p.address || p.info?.agentAddress || "");
    if (!id || id === root) continue;
    ensureNode(nodes, id, {
      type: "persistent_agent",
      label: "Persistent agent",
      agentStatus: statusFromPersistent(p.info),
      lastSeen: p.info?.lastHeartbeatBlock,
      live: true,
      txCount: 1,
    });
    pushEdge(edges, edgeSeen, {
      source: root,
      target: id,
      type: "call",
      value: "0",
      timestamp: Date.now() - 120_000,
      txHash: "0x" + "d".repeat(64),
      live: true,
    });
    ensureNode(nodes, HEARTBEAT, {
      type: "precompile",
      label: "AgentHeartbeat",
      live: true,
      txCount: persistentCount,
    });
    pushEdge(edges, edgeSeen, {
      source: id,
      target: HEARTBEAT,
      type: "heartbeat",
      value: "0",
      timestamp: Date.now() - 20_000,
      txHash: "0x" + "e".repeat(64),
      live: true,
    });
  }

  // Sibling agents: same owner as root-agent
  if (asPersistent?.info?.owner) {
    const owner = nodeId(asPersistent.info.owner);
    const siblings = persistent.filter((x) => {
      const id = nodeId(x.address || x.info?.agentAddress || "");
      return nodeId(x.info?.owner || "") === owner && id !== root;
    });
    for (const s of siblings.slice(0, 6)) {
      const id = nodeId(s.address || s.info?.agentAddress || "");
      ensureNode(nodes, id, {
        type: "persistent_agent",
        label: "Sibling agent",
        agentStatus: statusFromPersistent(s.info),
        lastSeen: s.info?.lastHeartbeatBlock,
        live: true,
      });
      pushEdge(edges, edgeSeen, {
        source: owner,
        target: id,
        type: "call",
        value: "0",
        timestamp: Date.now() - 90_000,
        txHash: "0x" + "f".repeat(64),
        live: true,
      });
    }
  }

  // If root is a factory, show a sample of registered agents as network context
  if (root === "0xd4aa9d55215dc8149af57605e70921ea16b73591") {
    for (const p of persistent.slice(0, 8)) {
      const id = nodeId(p.address || p.info?.agentAddress || "");
      if (!id) continue;
      ensureNode(nodes, id, {
        type: "persistent_agent",
        label: "Persistent agent",
        agentStatus: statusFromPersistent(p.info),
        live: true,
        lastSeen: p.info?.lastHeartbeatBlock,
      });
      pushEdge(edges, edgeSeen, {
        source: root,
        target: id,
        type: "call",
        value: "0",
        timestamp: Date.now() - 200_000,
        txHash: "0x" + "1".repeat(64),
        live: true,
      });
    }
  }
  if (root === "0x9dc4c054e53bcc4ce0a0ff09e890a7a8e817f304") {
    for (const s of sovereign.slice(0, 8)) {
      const id = nodeId(s.address || "");
      if (!id) continue;
      ensureNode(nodes, id, {
        type: "sovereign_agent",
        label: "Sovereign agent",
        agentStatus: "active",
        live: true,
        lastSeen: s.lastActivityBlock,
      });
      pushEdge(edges, edgeSeen, {
        source: root,
        target: id,
        type: "call",
        value: "0",
        timestamp: Date.now() - 200_000,
        txHash: "0x" + "2".repeat(64),
        live: true,
      });
    }
  }

  // --- Recent block scan for real txs involving root ---
  let blocksScanned = 0;
  const scanN = Math.max(8, Math.min(BLOCK_SCAN, 96));
  const blockIndexes = Array.from({ length: scanN }, (_, i) => blockHeight - i);

  try {
    const blocks = await mapPool(blockIndexes, SCAN_CONCURRENCY, async (n) => {
      try {
        return await client.getBlock({
          blockNumber: BigInt(n),
          includeTransactions: true,
        });
      } catch {
        return null;
      }
    });

    for (const block of blocks) {
      if (!block) continue;
      blocksScanned++;
      const ts = Number(block.timestamp) * 1000;
      const txs = block.transactions as (Hash | Transaction)[];
      for (const raw of txs) {
        if (typeof raw === "string") continue;
        const tx = raw as Transaction;
        const from = nodeId(tx.from || "");
        const to = tx.to ? nodeId(tx.to) : null;
        if (from !== root && to !== root) continue;

        const peer = from === root ? to : from;
        if (!peer || !to) continue;

        const value = tx.value ?? BigInt(0);
        const edgeType = classifyTx(from, to, value);

        let peerType: NodeType = "eoa";
        if (PRECOMPILE_HINTS[peer]) peerType = "precompile";
        else if (KNOWN_CONTRACTS[peer]) peerType = "contract";

        // refine peer type from agent cache
        if (persistent.some((p) => nodeId(p.address || p.info?.agentAddress || "") === peer)) {
          peerType = "persistent_agent";
        } else if (sovereign.some((s) => nodeId(s.address || "") === peer)) {
          peerType = "sovereign_agent";
        }

        ensureNode(nodes, peer, {
          type: peerType,
          label: labelFor(peer),
          live: true,
          lastSeen: Number(block.number),
          txCount: 1,
        });

        pushEdge(edges, edgeSeen, {
          source: from,
          target: to,
          type: edgeType,
          value: value.toString(),
          timestamp: ts,
          txHash: tx.hash,
          live: true,
        });
      }
    }
  } catch {
    /* scan best-effort */
  }

  // Enrich peer balances for top peers (cap RPC load)
  const peers = Array.from(nodes.keys())
    .filter((id) => id !== root)
    .slice(0, 14);
  await mapPool(peers, 6, async (id) => {
    try {
      const [bal, c] = await Promise.all([
        client.getBalance({ address: id as Address }),
        client.getBytecode({ address: id as Address }),
      ]);
      const n = nodes.get(id)!;
      const isCode = Boolean(c && c !== "0x");
      let type = n.type;
      if (type === "eoa" && isCode) type = "contract";
      if (PRECOMPILE_HINTS[id]) type = "precompile";
      ensureNode(nodes, id, {
        type,
        balance: bal.toString(),
        label: n.label || labelFor(id),
        live: true,
        txCount: n.txCount,
        lastSeen: n.lastSeen,
        agentStatus: n.agentStatus,
      });
    } catch {
      /* skip */
    }
  });

  ensureNode(nodes, root, {
    type: rootType,
    label: rootLabel || "Root",
    agentStatus,
    balance: balance.toString(),
    txCount: Number(nonce),
    lastSeen: blockHeight,
    live: true,
  });

  // If graph is sparse, attach labeled system hubs with orientation edges
  // (so the filter/UI still shows neighbors — not invented app history)
  if (edges.length === 0) {
    const hubs = [
      "0x532f0df0896f353d8c3dd8cc134e8129da2a3948",
      "0x56e776bae2dd60664b69bd5f865f1180ffb7d58b",
      HEARTBEAT,
    ] as const;
    for (const hub of hubs) {
      ensureNode(nodes, hub, {
        type: PRECOMPILE_HINTS[hub] ? "precompile" : "contract",
        label: labelFor(hub),
        live: true,
        txCount: 0,
      });
      pushEdge(edges, edgeSeen, {
        source: root,
        target: hub,
        type: "call",
        value: "0",
        timestamp: Date.now(),
        txHash: "0x" + "0".repeat(64),
        live: true,
      });
    }
  }

  // Orientation-only edges use zero hash — exclude from "rich live" count
  const realTxOrAgentEdges = edges.filter(
    (e) => e.live !== false && e.txHash && !/^0x0+$/i.test(e.txHash)
  ).length;
  const graph: GraphData = {
    root,
    nodes: Array.from(nodes.values()),
    edges,
    blockHeight,
    fetchedAt: new Date().toISOString(),
    source: realTxOrAgentEdges > 0 ? "live" : "live_partial",
    note:
      realTxOrAgentEdges > 0
        ? `Live graph: agent registry + last ${blocksScanned} blocks of txs involving this address. Not full historical explorer history.`
        : `Root is live from RPC. No agent links or recent txs in last ${blocksScanned} blocks — showing Ritual system hubs for orientation only (not personal tx history). Use Demo for a full sample graph.`,
  };

  return {
    graph,
    rootLive: {
      address: root,
      type: rootType,
      agentStatus,
      balance: balance.toString(),
      balanceRit: formatEther(balance),
      hasCode,
      txCount: Number(nonce),
    },
    meta: {
      agentCacheOk,
      persistentCount,
      sovereignCount,
      blocksScanned,
      liveEdges: realTxOrAgentEdges,
      scanWindowBlocks: scanN,
    },
  };
}
