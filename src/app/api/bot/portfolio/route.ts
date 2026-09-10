import { NextResponse } from "next/server";
import { reconcilePaperSleeve } from "@/lib/paper-trading";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await reconcilePaperSleeve(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load the bot portfolio ledger." }, { status: 500 });
  }
}
