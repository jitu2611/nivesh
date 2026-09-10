import { NextResponse } from "next/server";
import { kiteMcp, resultText } from "@/lib/kite-mcp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await kiteMcp.callReadOnly("get_profile");
    const text = resultText(profile);
    const requiresLogin = /login|log in|authoriz|session|token/i.test(text);
    const authorized = !profile.isError && !requiresLogin && text.length > 0;

    return NextResponse.json(
      {
        transportConnected: kiteMcp.isConnected(),
        authorized,
        mode: "read-only",
        checkedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        transportConnected: kiteMcp.isConnected(),
        authorized: false,
        mode: "read-only",
        checkedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
