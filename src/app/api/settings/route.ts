import { NextRequest, NextResponse } from "next/server";
import { getRuntimeSettings, saveRuntimeSettings } from "@/lib/runtime-store";

const MIN_CAPITAL = 10_000;
const MAX_CAPITAL = 100_000_000;

export async function GET() {
  return NextResponse.json(await getRuntimeSettings(), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const capital = Number(body?.capital);

  if (!Number.isFinite(capital) || capital < MIN_CAPITAL || capital > MAX_CAPITAL) {
    return NextResponse.json(
      { error: `Capital must be between ₹${MIN_CAPITAL.toLocaleString("en-IN")} and ₹${MAX_CAPITAL.toLocaleString("en-IN")}.` },
      { status: 400 },
    );
  }

  try {
    const settings = await saveRuntimeSettings(capital);
    return NextResponse.json({ ...settings, saved: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save bot capital." },
      { status: 409 },
    );
  }
}
