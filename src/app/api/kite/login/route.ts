import { NextResponse } from "next/server";
import { firstHttpsUrl, kiteMcp, resultText } from "@/lib/kite-mcp";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await kiteMcp.callReadOnly("login");
    const text = resultText(result);
    const loginUrl = firstHttpsUrl(text);

    if (!loginUrl) {
      return NextResponse.json({ error: "Kite did not return an authentication link." }, { status: 502 });
    }

    const hostname = new URL(loginUrl).hostname;
    const trusted = hostname === "zerodha.com" || hostname.endsWith(".zerodha.com") || hostname === "kite.trade" || hostname.endsWith(".kite.trade");
    if (!trusted) {
      return NextResponse.json({ error: "Kite returned an unexpected authentication domain." }, { status: 502 });
    }

    return NextResponse.json({ loginUrl }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start Kite authentication." },
      { status: 503 },
    );
  }
}
