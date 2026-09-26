import { NextRequest, NextResponse } from "next/server";
import { reconcilePaperSleeve } from "@/lib/paper-trading";
import { authorizeMutation } from "@/lib/request-security";
import { getBotSleeve, getRuntimeSettings } from "@/lib/runtime-store";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

export async function GET() {
  try {
    return NextResponse.json(await getBotSleeve(), { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Unable to load the paper portfolio ledger." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  if (!authorizeMutation(request, "reconcile-paper-sleeve")) {
    return NextResponse.json({ error: "Reconciliation request was not authorized by the Nivesh UI." }, { status: 403, headers: NO_STORE });
  }
  try {
    const settings = await getRuntimeSettings();
    if (settings.paused) return NextResponse.json(await getBotSleeve(), { headers: NO_STORE });
    return NextResponse.json(await reconcilePaperSleeve(), { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Unable to reconcile the paper portfolio ledger." }, { status: 500, headers: NO_STORE });
  }
}
