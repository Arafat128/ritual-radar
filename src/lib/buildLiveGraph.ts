import {
  createPublicClient,
  formatEther,
  http,
  type Address,
  type Hash,
  type PublicClient,
  type Transaction,
} from "viem";
import type {
  AgentStatus,
  GraphData,
  GraphEdge,
  GraphInteraction,
  GraphNode,
  NodeType,
} from "@/lib/graphTypes";
import {
  APP_CONTRACT_PROBES,
  KNOWN_CONTRACTS,
} from "@/lib/knownContracts";
import {
  isPrecompileAddress,
  PRECOMPILE_HINTS,
  RPC_URL,
} from "@/lib/ritual";

const HEARTBEAT = "0xef505e801f1db392b5289690e2ffc20e840a3aca";
const AGENTS_CACHE =
  "https://explorer.ritualfoundation.org/api/agents/cache";

/** Light scan (default). Ritual ~0.35s/block → 600 blocks ≈ 3.5 min of chain time. */
const BLOCK_SCAN_LIGHT = Number(process.env.RADAR_BLOCK_SCAN || 600);
/**
 * Full tx history (opt-in on Radar site only).
 * Still a recent window — not lifetime (RPC prunes old getBlock history).
 */
const BLOCK_SCAN_FULL = Number(process.env.RADAR_BLOCK_SCAN_FULL || 2500);
const SCAN_CONCURRENCY = 16;
/** Cap graph edges for WebGL performance */
const MAX_TX_EDGES = 180;
const MAX_INTERACTIONS_LIST = 220;
/** Classify this many peers with getBytecode (was 14 — caused "EOA-only" graphs) */
const PEER_CODE_ENRICH_CAP = 80;

const ROLE_VIEW_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "admin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export type BuildLiveGraphOpts = {
  /**
   * Deep-scan recent chain history for every tx involving the address.
   * Only enabled via Radar website toggle — not for Rite embeds.
   */
  fullHistory?: boolean;
};

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
    fullHistory: boolean;
    realTxCount: number;
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
  e: Omit<GraphEdge, "id"> & { id?: string },
  opts?: { allowSelf?: boolean }
) {
  const src = nodeId(e.source);
  const tgt = e.target ? nodeId(e.target) : "";
  if (!tgt) return;
  if (src === tgt && !opts?.allowSelf) return;
  const id =
    e.id ||
    (e.txHash && !/^0x0+$/i.test(e.txHash)
      ? `tx:${e.txHash.toLowerCase()}`
      : `${e.type}:${src.slice(0, 10)}:${tgt.slice(0, 10)}:${e.timestamp}`);
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
    blockNumber: e.blockNumber,
    methodId: e.methodId,
  });
}

function methodIdFromInput(input: unknown): string | undefined {
  if (typeof input !== "string" || input.length < 10) return undefined;
  if (!input.startsWith("0x")) return undefined;
  return input.slice(0, 10).toLowerCase();
}

function isRealTxHash(h: string | undefined): boolean {
  if (!h || !/^0x[a-fA-F0-9]{64}$/.test(h)) return false;
  if (/^0x0+$/i.test(h)) return false;
  // Reject synthetic padding (0xaaa…, 0xddd…) used for registry-inferred edges
  if (/^0x([0-9a-f])\1{63}$/i.test(h)) return false;
  return true;
}

function roleMethodId(role: "owner" | "treasury" | "admin"): string {
  if (role === "owner") return "owner()";
  if (role === "treasury") return "treasury()";
  return "admin()";
}

/**
 * Draw one role edge (idempotent via edgeSeen).
 * - owner/admin: controller → contract
 * - treasury: contract → fee recipient
 */
function pushRoleEdge(
  edges: GraphEdge[],
  edgeSeen: Set<string>,
  nodes: Map<string, GraphNode>,
  opts: {
    role: "owner" | "treasury" | "admin";
    contract: string;
    who: string;
    contractLabel?: string;
    whoLabel?: string;
    deployTx?: string;
  }
): boolean {
  const contract = nodeId(opts.contract);
  const who = nodeId(opts.who);
  if (!contract || !who || contract === who) return false;
  if (who === "0x0000000000000000000000000000000000000000") return false;

  ensureNode(nodes, contract, {
    type: "contract",
    label: opts.contractLabel || KNOWN_CONTRACTS[contract] || "Contract",
    live: true,
    txCount: 1,
  });
  ensureNode(nodes, who, {
    type: "eoa",
    label: opts.whoLabel || labelFor(who, "Account"),
    live: true,
    txCount: 0,
  });

  const isTreasury = opts.role === "treasury";
  const source = isTreasury ? contract : who;
  const target = isTreasury ? who : contract;
  const before = edgeSeen.size;
  pushEdge(edges, edgeSeen, {
    id: `role:${opts.role}:${source}:${target}`,
    source,
    target,
    type: isTreasury ? "transfer" : "call",
    value: "0",
    timestamp: Date.now() - 1000,
    txHash: opts.deployTx || ("0x" + "0".repeat(64)),
    live: true,
    methodId: roleMethodId(opts.role),
  });
  return edgeSeen.size > before;
}

async function readRole(
  client: PublicClient,
  address: Address,
  role: "owner" | "treasury" | "admin"
): Promise<string | null> {
  try {
    return (await client.readContract({
      address,
      abi: ROLE_VIEW_ABI,
      functionName: role,
    })) as string;
  } catch {
    return null;
  }
}

/**
 * Code-verified relationship recovery (no fake hubs):
 * 1) Root is owner/treasury/admin of a known app → link root to that app
 * 2) Root IS a known app → link out to its owner/treasury/admin
 * 3) Root has bytecode (any contract) → try Ownable-style owner/treasury/admin
 * 4) Sibling known apps that share the same owner (capped)
 *
 * Fixes Rite "Radar · pool" opening BountyPool with zero edges (owner is treasury, not the pool).
 */
async function linkKnownAppRoles(
  client: PublicClient,
  root: string,
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[],
  edgeSeen: Set<string>
): Promise<number> {
  let linked = 0;
  const rootAddr = root as Address;

  // --- Pass 1: known app catalog (both directions) ---
  await mapPool(APP_CONTRACT_PROBES, 4, async (probe) => {
    const addr = nodeId(probe.address);
    try {
      const code = await client.getBytecode({ address: addr as Address });
      if (!code || code === "0x") return;

      for (const role of probe.roles) {
        const who = await readRole(client, addr as Address, role);
        if (!who) continue;
        const whoId = nodeId(who);

        // Direction A: scanning the wallet that owns / is treasury of this app
        if (whoId === root) {
          if (
            pushRoleEdge(edges, edgeSeen, nodes, {
              role,
              contract: addr,
              who: root,
              contractLabel: probe.label,
              whoLabel: labelFor(root, "Account"),
              deployTx: probe.deployTx,
            })
          ) {
            linked++;
          }
        }

        // Direction B: scanning the app contract itself → show its owner/treasury
        if (addr === root && whoId !== root) {
          if (
            pushRoleEdge(edges, edgeSeen, nodes, {
              role,
              contract: root,
              who: whoId,
              contractLabel: probe.label || labelFor(root),
              whoLabel:
                role === "owner"
                  ? "Owner"
                  : role === "treasury"
                    ? "Treasury"
                    : "Admin",
              deployTx: probe.deployTx,
            })
          ) {
            linked++;
          }
        }
      }
    } catch {
      /* skip probe */
    }
  });

  // --- Pass 2: generic Ownable on root if it is a contract and still sparse ---
  // Helps unknown apps without harming EOAs (no code → skip).
  try {
    const rootCode = await client.getBytecode({ address: rootAddr });
    if (rootCode && rootCode !== "0x") {
      for (const role of ["owner", "treasury", "admin"] as const) {
        const who = await readRole(client, rootAddr, role);
        if (!who || nodeId(who) === root) continue;
        if (
          pushRoleEdge(edges, edgeSeen, nodes, {
            role,
            contract: root,
            who,
            contractLabel: labelFor(root, "Contract"),
            whoLabel:
              role === "owner"
                ? "Owner"
                : role === "treasury"
                  ? "Treasury"
                  : "Admin",
          })
        ) {
          linked++;
        }
      }
    }
  } catch {
    /* optional */
  }

  // --- Pass 3: sibling known apps under same owner (only if we know an owner peer) ---
  // Keeps graphs useful for Rite contracts without inventing heartbeat/system hubs.
  try {
    let ownerOfRoot: string | null = null;
    const rootCode = await client.getBytecode({ address: rootAddr });
    if (rootCode && rootCode !== "0x") {
      ownerOfRoot = await readRole(client, rootAddr, "owner");
    }
    // Or root itself is an owner wallet: use root as the shared owner key
    const sharedOwner = ownerOfRoot ? nodeId(ownerOfRoot) : root;

    if (sharedOwner) {
      await mapPool(APP_CONTRACT_PROBES, 4, async (probe) => {
        const addr = nodeId(probe.address);
        if (addr === root) return;
        try {
          const code = await client.getBytecode({ address: addr as Address });
          if (!code || code === "0x") return;
          const who = await readRole(client, addr as Address, "owner");
          if (!who || nodeId(who) !== sharedOwner) return;
          // Only attach siblings when root is that owner OR root is another app of same owner
          const rootIsOwner = sharedOwner === root;
          const rootIsSiblingApp = Boolean(ownerOfRoot);
          if (!rootIsOwner && !rootIsSiblingApp) return;

          if (
            pushRoleEdge(edges, edgeSeen, nodes, {
              role: "owner",
              contract: addr,
              who: sharedOwner,
              contractLabel: probe.label,
              whoLabel: rootIsOwner ? labelFor(root, "Owner") : "Shared owner",
              deployTx: probe.deployTx,
            })
          ) {
            linked++;
          }
        } catch {
          /* skip */
        }
      });
    }
  } catch {
    /* optional */
  }

  return linked;
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
  _from: string,
  to: string | null,
  value: bigint
): GraphEdge["type"] {
  if (!to) return "call";
  if (to === HEARTBEAT) return "heartbeat";
  if (to === "0x56e776bae2dd60664b69bd5f865f1180ffb7d58b") return "scheduled";
  // Native precompile range → async (HTTP/LLM/crypto precompiles, agents, …)
  if (isPrecompileAddress(to)) return "async";
  if (value > BigInt(0)) return "transfer";
  return "call";
}

/**
 * Initial peer type before bytecode (known labels + precompile range).
 * Unknowns start as eoa and are upgraded via getBytecode enrichment.
 */
function classifyPeerQuick(
  peer: string,
  opts: { created?: boolean }
): NodeType {
  if (isPrecompileAddress(peer)) return "precompile";
  // System / app contracts in catalogs
  if (KNOWN_CONTRACTS[peer] || PRECOMPILE_HINTS[peer]) return "contract";
  if (opts.created) return "contract";
  return "eoa";
}

export async function buildLiveGraph(
  rootInput: string,
  opts: BuildLiveGraphOpts = {}
): Promise<LiveGraphResult> {
  const fullHistory = Boolean(opts.fullHistory);
  const root = nodeId(rootInput);
  const client = createPublicClient({
    transport: http(RPC_URL, {
      timeout: fullHistory ? 25_000 : 18_000,
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
  // Correct topology: wallet --owns--> agent --heartbeat--> AgentHeartbeat
  // Never draw wallet --heartbeat--> AgentHeartbeat (only agents pulse the registry).
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
      source: id, // agent → heartbeat (not owner wallet)
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

  // --- Block scan: light peek OR full interaction history (opt-in) ---
  let blocksScanned = 0;
  // Light was wrongly capped at 96 — too short for Ritual's ~0.35s blocks
  const scanCap = fullHistory
    ? Math.max(200, Math.min(BLOCK_SCAN_FULL, 3000))
    : Math.max(120, Math.min(BLOCK_SCAN_LIGHT, 900));
  const blockIndexes = Array.from(
    { length: scanCap },
    (_, i) => blockHeight - i
  ).filter((n) => n >= 0);

  const interactions: GraphInteraction[] = [];
  let realTxHits = 0;

  try {
    // Chunked pools so full history stays within serverless time budget
    const chunkSize = fullHistory ? 120 : scanCap;
    for (let off = 0; off < blockIndexes.length; off += chunkSize) {
      const slice = blockIndexes.slice(off, off + chunkSize);
      const blocks = await mapPool(slice, SCAN_CONCURRENCY, async (n) => {
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
        const bn = Number(block.number);
        const txs = block.transactions as (Hash | Transaction)[];
        for (const raw of txs) {
          if (typeof raw === "string") continue;
          const tx = raw as Transaction;
          const from = nodeId(tx.from || "");
          const to = tx.to ? nodeId(tx.to) : null;
          if (from !== root && to !== root) continue;
          if (!isRealTxHash(tx.hash)) continue;

          realTxHits++;
          const value = tx.value ?? BigInt(0);
          const edgeType = classifyTx(from, to, value);
          const methodId = methodIdFromInput(
            (tx as Transaction & { input?: string }).input ??
              (tx as { data?: string }).data
          );

          const direction: GraphInteraction["direction"] =
            from === root && to === root
              ? "self"
              : from === root
                ? "out"
                : "in";

          interactions.push({
            hash: tx.hash,
            from,
            to,
            value: value.toString(),
            timestamp: ts,
            blockNumber: bn,
            type: edgeType,
            methodId,
            direction,
          });

          // Contract create: to is null — resolve contractAddress from receipt
          let peer = to;
          let created = false;
          if (!peer && from === root) {
            try {
              const receipt = await client.getTransactionReceipt({
                hash: tx.hash as Hash,
              });
              if (receipt.contractAddress) {
                peer = nodeId(receipt.contractAddress);
                created = true;
              }
            } catch {
              /* receipt unavailable */
            }
          }
          if (!peer) continue;

          let peerType = classifyPeerQuick(peer, { created: created || !to });
          if (
            persistent.some(
              (p) =>
                nodeId(p.address || p.info?.agentAddress || "") === peer
            )
          ) {
            peerType = "persistent_agent";
          } else if (
            sovereign.some((s) => nodeId(s.address || "") === peer)
          ) {
            peerType = "sovereign_agent";
          }

          // Accumulate hit count on peer for prioritising bytecode checks
          ensureNode(nodes, peer, {
            type: peerType,
            label: labelFor(
              peer,
              created || !to
                ? "Deployed contract"
                : peerType === "precompile"
                  ? PRECOMPILE_HINTS[peer]
                  : peerType === "contract"
                    ? KNOWN_CONTRACTS[peer] || "Contract"
                    : undefined
            ),
            live: true,
            lastSeen: bn,
            txCount: 1,
          });

          pushEdge(
            edges,
            edgeSeen,
            {
              source: from,
              target: peer,
              type: edgeType,
              value: value.toString(),
              timestamp: ts,
              txHash: tx.hash,
              live: true,
              blockNumber: bn,
              methodId: methodId || (!to ? "CREATE" : undefined),
            },
            { allowSelf: false }
          );
        }
      }

      // Early stop light mode only after enough hits AND we already have
      // some non-EOA peers (or hit cap) — avoids stopping on pure EOA spam.
      if (!fullHistory && realTxHits >= 40) {
        const hasNonEoa = Array.from(nodes.values()).some(
          (n) => n.id !== root && n.type !== "eoa"
        );
        if (hasNonEoa || realTxHits >= 80) break;
      }
    }
  } catch {
    /* scan best-effort */
  }

  // --- Code-verified app roles (owner / treasury / admin) ---
  // Critical for EOAs with historical deploys but no recent blocks (treasury, etc.)
  let roleLinks = 0;
  try {
    roleLinks = await linkKnownAppRoles(
      client,
      root,
      nodes,
      edges,
      edgeSeen
    );
  } catch {
    /* optional */
  }

  // Newest first; cap for UI + renderer
  interactions.sort((a, b) => b.blockNumber - a.blockNumber);
  const interactionsCapped = interactions.slice(0, MAX_INTERACTIONS_LIST);

  // Prefer real-tx edges; drop oldest if over cap
  const realEdges = edges.filter((e) => isRealTxHash(e.txHash));
  const otherEdges = edges.filter((e) => !isRealTxHash(e.txHash));
  realEdges.sort((a, b) => b.timestamp - a.timestamp);
  const trimmedReal = realEdges.slice(0, MAX_TX_EDGES);
  edges.length = 0;
  edges.push(...trimmedReal, ...otherEdges);

  // Classify peers with getBytecode — prioritize high-degree / recent peers.
  // BUGFIX: previously only first 14 Map keys were checked, so most contracts
  // stayed typed as "eoa" (user saw "only EOAs" for busy wallets).
  const peersRanked = Array.from(nodes.values())
    .filter((n) => n.id !== root)
    .sort((a, b) => {
      // Prefer unknowns that look like they need classification
      const aNeed = a.type === "eoa" ? 1 : 0;
      const bNeed = b.type === "eoa" ? 1 : 0;
      if (aNeed !== bNeed) return bNeed - aNeed;
      return (b.txCount || 0) - (a.txCount || 0) || (b.lastSeen || 0) - (a.lastSeen || 0);
    })
    .slice(0, PEER_CODE_ENRICH_CAP)
    .map((n) => n.id);

  await mapPool(peersRanked, 10, async (id) => {
    try {
      const n = nodes.get(id);
      if (!n) return;

      // Preserve agent types; force precompile range
      if (n.type === "persistent_agent" || n.type === "sovereign_agent") {
        const bal = await client.getBalance({ address: id as Address });
        ensureNode(nodes, id, {
          type: n.type,
          balance: bal.toString(),
          label: n.label,
          live: true,
          txCount: n.txCount,
          lastSeen: n.lastSeen,
          agentStatus: n.agentStatus,
        });
        return;
      }

      if (isPrecompileAddress(id)) {
        const bal = await client.getBalance({ address: id as Address });
        ensureNode(nodes, id, {
          type: "precompile",
          balance: bal.toString(),
          label: PRECOMPILE_HINTS[id] || labelFor(id, "Precompile"),
          live: true,
          txCount: n.txCount,
          lastSeen: n.lastSeen,
        });
        return;
      }

      const [bal, code] = await Promise.all([
        client.getBalance({ address: id as Address }),
        client.getBytecode({ address: id as Address }),
      ]);
      const isCode = Boolean(code && code !== "0x");
      let type: NodeType = "eoa";
      if (KNOWN_CONTRACTS[id] || PRECOMPILE_HINTS[id] || isCode) {
        type = "contract";
      }

      ensureNode(nodes, id, {
        type,
        balance: bal.toString(),
        label:
          n.label ||
          labelFor(
            id,
            type === "contract" ? "Contract" : "EOA"
          ),
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

  // Do NOT invent wallet→AgentHeartbeat / wallet→Scheduler edges.
  // Heartbeat only for persistent agents. Connections for EOAs come from:
  // recent txs + code-verified owner()/treasury()/admin() on known apps.
  const realTxEdgeCount = edges.filter(
    (e) => e.live !== false && isRealTxHash(e.txHash)
  ).length;
  const hasAnyLiveEdge = edges.length > 0;
  const nonceNum = Number(nonce);

  const noteParts: string[] = [];
  if (realTxHits > 0) {
    noteParts.push(
      `Found ${realTxHits} recent tx(s) in last ${blocksScanned} blocks.`
    );
  } else {
    noteParts.push(
      `No txs in last ${blocksScanned} blocks (~${Math.max(
        1,
        Math.round((blocksScanned * 0.35) / 60)
      )} min of chain time).`
    );
  }
  if (roleLinks > 0) {
    noteParts.push(
      `${roleLinks} code-verified role link(s) via owner()/treasury()/admin() on known app contracts.`
    );
  }
  const nonEoaPeers = Array.from(nodes.values()).filter(
    (n) => n.id !== root && n.type !== "eoa"
  ).length;
  const eoaPeers = Array.from(nodes.values()).filter(
    (n) => n.id !== root && n.type === "eoa"
  ).length;
  if (nonEoaPeers > 0 || eoaPeers > 0) {
    noteParts.push(
      `Peers: ${nonEoaPeers} contract/precompile/agent · ${eoaPeers} EOA (bytecode-checked).`
    );
  }
  if (nonceNum > 0 && realTxHits === 0) {
    noteParts.push(
      `Nonce is ${nonceNum} (historical activity exists); Ritual RPC cannot serve lifetime tx history — enable Full tx for a deeper recent window, role links recover live ownership.`
    );
  }
  if (!hasAnyLiveEdge) {
    noteParts.push(
      "Empty neighborhood for this window (no fake hubs). Full tx digs more recent blocks; lifetime needs indexer/paid dig."
    );
  } else if (!fullHistory) {
    noteParts.push(
      "Enable Full tx on the Radar site for a deeper recent-block scan (contracts + precompiles included)."
    );
  }
  noteParts.push(
    "Heartbeat edges only for persistent agents to AgentHeartbeat, never bare EOAs."
  );

  const graph: GraphData = {
    root,
    nodes: Array.from(nodes.values()),
    edges,
    blockHeight,
    fetchedAt: new Date().toISOString(),
    source: hasAnyLiveEdge ? "live" : "live_partial",
    note: noteParts.join(" "),
    fullHistory,
    interactions: fullHistory ? interactionsCapped : undefined,
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
      txCount: nonceNum,
    },
    meta: {
      agentCacheOk,
      persistentCount,
      sovereignCount,
      blocksScanned,
      liveEdges: realTxEdgeCount + roleLinks,
      scanWindowBlocks: scanCap,
      fullHistory,
      realTxCount: realTxHits,
    },
  };
}
