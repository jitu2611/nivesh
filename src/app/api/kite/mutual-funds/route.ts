import { NextResponse } from "next/server";
import { readMutualFunds } from "@/lib/mutual-funds-service";
import { marketDataError } from "@/lib/historical-prices";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store, max-age=0" };
export async function GET() {
  try { return NextResponse.json(await readMutualFunds(), { headers }); }
  catch (error) {
    const message = marketDataError(error);
    const requiresLogin = /authoriz|reconnect kite/i.test(message);
    return NextResponse.json({ error: message, requiresLogin }, { status: requiresLogin ? 401 : 502, headers });
  }
}
