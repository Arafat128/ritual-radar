import { isAddress } from "viem";
import { buildLiveGraph } from "@/lib/buildLiveGraph";
import { RITUAL_CHAIN_ID } from "@/lib/ritual";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Live graph: root RPC fields + explorer agent relationships +
 * recent-block tx scan involving the address.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") || "").toLowerCase();
  if (!isAddress(address)) {
    return Response.json({ error: "valid address required" }, { status: 400 });
  }

  try {
    const result = await buildLiveGraph(address);
    return Response.json(
      {
        ok: true,
        chainId: RITUAL_CHAIN_ID,
        blockHeight: result.graph.blockHeight,
        rootLive: result.rootLive,
        graph: result.graph,
        meta: result.meta,
        note: result.graph.note,
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
