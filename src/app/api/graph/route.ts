import { isAddress } from "viem";
import { buildLiveGraph } from "@/lib/buildLiveGraph";
import { RITUAL_CHAIN_ID } from "@/lib/ritual";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Full history scans more blocks — allow longer serverless runtime */
export const maxDuration = 60;

/**
 * Live graph: root RPC + agent registry + block scan for txs.
 *
 * Query:
 *   address  — required 0x…
 *   full=1   — opt-in deep tx history (Radar website only; ignore for embeds)
 *   embed=1  — forces light mode even if full is set
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

  // Full history is only available on the Radar site (not embeds)
  const fullHistory = fullRequested && !embed;

  try {
    const result = await buildLiveGraph(address, { fullHistory });
    return Response.json(
      {
        ok: true,
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
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "graph failed",
      },
      { status: 500 }
    );
  }
}
