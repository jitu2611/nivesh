import { NextResponse } from "next/server";
import { readPortfolio } from "@/lib/portfolio";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readPortfolio(), { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Kite portfolio.";
    const requiresLogin = /login|log in|authoriz|session|token/i.test(message);
    return NextResponse.json(
      { error: requiresLogin ? "Kite authorization has expired. Please reconnect." : "Unable to load the Kite portfolio right now.", requiresLogin },
      { status: requiresLogin ? 401 : 502, headers: { "cache-control": "no-store" } },
    );
  }
}
