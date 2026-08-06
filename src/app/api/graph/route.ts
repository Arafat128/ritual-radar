import { isAddress } from "viem";
import {
  buildLiveGraph,
  type LiveGraphResult,
} from "@/lib/buildLiveGraph";
import { RITUAL_CHAIN_ID } from "@/lib/ritual";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Full history scans more blocks — allow longer serverless runtime */
export const maxDuration = 60;

/** Short in-process cache — cuts 429s on refresh / double-load */
const CACHE_TTL_MS = 45_000;
const graphCache = new Map<
  string,
  { at: number; result: LiveGraphResult }
>();
/** Single-flight: same address+mode shares one in-flight scan */
const inflight = new Map<string, Promise<LiveGraphResult>>();

/**
 * Live graph: root RPC + agent registry + block scan for txs.
 *
 * Query:
 *   address  — required 0x…
 *   full=1   — opt-in deep tx history (Radar website only; ignore for embeds)
 *   embed=1  — forces light mode even if full is set
 *   refresh=1 — bypass short cache (still rate-limited by RPC throttle)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") || "").toLowerCase();
  if (!isAddress(address)) {
    return Response.json({ error: "valid address required" }, { status: 400 });
  }

  const embed =
    url.searchParams.get("embed") === "1" ||
    url.searchParams.get("embed") === "true";
  const fullRequested =
    url.searchParams.get("full") === "1" ||
    url.searchParams.get("full") === "true" ||
    url.searchParams.get("fullHistory") === "1";
  const bypassCache =
    url.searchParams.get("refresh") === "1" ||
    url.searchParams.get("refresh") === "true";

  // Full history is only available on the Radar site (not embeds)
  const fullHistory = fullRequested && !embed;
  const cacheKey = `${address}:${fullHistory ? "full" : "light"}`;

  try {
    if (!bypassCache) {
      const hit = graphCache.get(cacheKey);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        const result = hit.result;
        return Response.json(
          {
            ok: true,
            cached: true,
            chainId: RITUAL_CHAIN_ID,
            blockHeight: result.graph.blockHeight,
            rootLive: result.rootLive,
            graph: result.graph,
            meta: result.meta,
            note: result.graph.note,
            fullHistory: result.meta.fullHistory,
          },
          {
            headers: {
              "Cache-Control": "private, max-age=30",
            },
          }
        );
      }
    }

    let pending = inflight.get(cacheKey);
    if (!pending) {
      pending = buildLiveGraph(address, { fullHistory }).finally(() => {
        inflight.delete(cacheKey);
      });
      inflight.set(cacheKey, pending);
    }
    const result = await pending;
    graphCache.set(cacheKey, { at: Date.now(), result });

    // Cap cache size (serverless instance memory)
    if (graphCache.size > 40) {
      const oldest = Array.from(graphCache.entries()).sort(
        (a, b) => a[1].at - b[1].at
      )[0];
      if (oldest) graphCache.delete(oldest[0]);
    }

    return Response.json(
      {
        ok: true,
        cached: false,
        chainId: RITUAL_CHAIN_ID,
        blockHeight: result.graph.blockHeight,
        rootLive: result.rootLive,
        graph: result.graph,
        meta: result.meta,
        note: result.graph.note,
        fullHistory: result.meta.fullHistory,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30",
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "graph failed";
    // Serve stale cache on 429 / transient failure if we have one
    const stale = graphCache.get(cacheKey);
    if (stale) {
      return Response.json(
        {
          ok: true,
          cached: true,
          stale: true,
          chainId: RITUAL_CHAIN_ID,
          blockHeight: stale.result.graph.blockHeight,
          rootLive: stale.result.rootLive,
          graph: {
            ...stale.result.graph,
            note: `RPC busy — showing cached graph. ${msg}`.slice(0, 280),
          },
          meta: stale.result.meta,
          note: "cached after error",
          fullHistory: stale.result.meta.fullHistory,
        },
        { status: 200 }
      );
    }
    return Response.json(
      {
        error: msg,
      },
      {
        status:
          msg.includes("429") || /too many requests/i.test(msg) ? 429 : 500,
      }
    );
  }
}
