import { createPublicClient, http } from "viem";
import { RPC_URL, RITUAL_CHAIN_ID } from "@/lib/ritual";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const client = createPublicClient({
      transport: http(RPC_URL, { timeout: 12_000 }),
    });
    const blockNumber = await client.getBlockNumber();
    return Response.json({
      ok: true,
      chainId: RITUAL_CHAIN_ID,
      blockNumber: Number(blockNumber),
      at: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "rpc failed",
      },
      { status: 502 }
    );
  }
}
