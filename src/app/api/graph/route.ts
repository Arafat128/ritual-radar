import { createPublicClient, formatEther, http, isAddress } from "viem";
import { buildMockGraph } from "@/lib/mockGraph";
import type { GraphData, GraphNode, NodeType } from "@/lib/graphTypes";
import { PRECOMPILE_HINTS, RPC_URL, RITUAL_CHAIN_ID } from "@/lib/ritual";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Graph API — live RPC enrichment + explorer agent cache.
 * Full tx-history edges still need reverse-engineered explorer APIs;
 * until then we return an enriched mock neighborhood rooted at the address.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") || "").toLowerCase();
  if (!isAddress(address)) {
    return Response.json({ error: "valid address required" }, { status: 400 });
  }

  try {
    const client = createPublicClient({
      transport: http(RPC_URL, { timeout: 15_000, retryCount: 2 }),
    });

    const [blockNumber, balance, code] = await Promise.all([
      client.getBlockNumber(),
      client.getBalance({ address: address as `0x${string}` }),
      client.getBytecode({ address: address as `0x${string}` }),
    ]);

    // Classify root via code + agent cache
    let rootType: NodeType = "eoa";
    let agentStatus: GraphNode["agentStatus"];
    let label: string | undefined;

    if (PRECOMPILE_HINTS[address]) {
      rootType = "precompile";
      label = PRECOMPILE_HINTS[address];
    } else if (code && code !== "0x") {
      rootType = "contract";
    }

    try {
      const cacheRes = await fetch(
        "https://explorer.ritualfoundation.org/api/agents/cache",
        { cache: "no-store", signal: AbortSignal.timeout(10_000) }
      );
      if (cacheRes.ok) {
        const cache = (await cacheRes.json()) as {
          persistent?: Array<{
            address?: string;
            info?: {
              agentAddress?: string;
              owner?: string;
              state?: string;
              isAlive?: boolean;
              lastHeartbeatBlock?: number;
            };
          }>;
          sovereign?: Array<{
            address?: string;
            lastActivityBlock?: number;
          }>;
        };
        const p = (cache.persistent || []).find((x) => {
          const a = (x.address || x.info?.agentAddress || "").toLowerCase();
          return a === address;
        });
        if (p) {
          rootType = "persistent_agent";
          label = label || "Persistent agent";
          const st = String(p.info?.state || "").toUpperCase();
          if (st.includes("FAIL") || p.info?.isAlive === false)
            agentStatus = "failed";
          else if (st.includes("REVIV")) agentStatus = "reviving";
          else agentStatus = "active";
        }
        const s = (cache.sovereign || []).find(
          (x) => (x.address || "").toLowerCase() === address
        );
        if (s) {
          rootType = "sovereign_agent";
          label = label || "Sovereign agent";
          agentStatus = agentStatus || "active";
        }
      }
    } catch {
      /* cache optional */
    }

    // Seed mock neighborhood, then overwrite root with live fields
    const graph: GraphData = buildMockGraph(address);
    graph.source = "live";
    graph.blockHeight = Number(blockNumber);
    graph.fetchedAt = new Date().toISOString();
    graph.nodes = graph.nodes.map((n) => {
      if (n.id !== address) return n;
      return {
        ...n,
        type: rootType,
        label: label || n.label,
        agentStatus,
        balance: balance.toString(),
        lastSeen: Number(blockNumber),
      };
    });

    return Response.json({
      ok: true,
      chainId: RITUAL_CHAIN_ID,
      blockHeight: Number(blockNumber),
      rootLive: {
        address,
        type: rootType,
        agentStatus,
        balance: balance.toString(),
        balanceRit: formatEther(balance),
        hasCode: Boolean(code && code !== "0x"),
      },
      graph,
      note: "Edges are mock topology until explorer tx APIs are reverse-engineered. Root node is live-enriched from RPC + agents/cache.",
    });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "graph failed",
      },
      { status: 500 }
    );
  }
}
