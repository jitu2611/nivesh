import { NextRequest, NextResponse } from "next/server";
import { firstHttpsUrl, kiteMcp, resultText } from "@/lib/kite-mcp";
import { authorizeMutation } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!authorizeMutation(request, "kite-login")) {
    return NextResponse.json({ error: "Kite login request was not authorized by the Nivesh UI." }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  try {
    const result = await kiteMcp.callReadOnly("login");
    const text = resultText(result);
    const loginUrl = firstHttpsUrl(text);

    if (!loginUrl) {
      return NextResponse.json({ error: "Kite did not return an authentication link." }, { status: 502, headers: { "cache-control": "no-store" } });
    }

    const hostname = new URL(loginUrl).hostname;
    const trusted = hostname === "zerodha.com" || hostname.endsWith(".zerodha.com") || hostname === "kite.trade" || hostname.endsWith(".kite.trade");
    if (!trusted) {
      return NextResponse.json({ error: "Kite returned an unexpected authentication domain." }, { status: 502, headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json({ loginUrl }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Unable to start Kite authentication." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
