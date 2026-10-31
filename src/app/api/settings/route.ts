import { NextRequest, NextResponse } from "next/server";
import { authorizeMutation } from "@/lib/request-security";
import { getRuntimeSettings, saveRuntimeSettings } from "@/lib/runtime-store";
import { workspaceTransaction } from "@/lib/workspace-store";

const MIN_CAPITAL = 10_000;
const MAX_CAPITAL = 100_000_000;
const NO_STORE = { "cache-control": "no-store" };

export async function GET() {
  return NextResponse.json(await getRuntimeSettings(), { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  if (!authorizeMutation(request, "update-settings")) {
    return NextResponse.json({ error: "Settings request was not authorized by the Nivesh UI." }, { status: 403, headers: NO_STORE });
  }

  const body = await request.json().catch(() => null) as { capital?: unknown; paused?: unknown } | null;
  const patch: { capital?: number; paused?: boolean } = {};

  if (body?.capital !== undefined) {
    const capital = Number(body.capital);
    if (!Number.isFinite(capital) || capital < MIN_CAPITAL || capital > MAX_CAPITAL) {
      return NextResponse.json(
        { error: `Capital must be between ₹${MIN_CAPITAL.toLocaleString("en-IN")} and ₹${MAX_CAPITAL.toLocaleString("en-IN")}.` },
        { status: 400, headers: NO_STORE },
      );
    }
    patch.capital = capital;
  }
  if (body?.paused !== undefined) {
    if (typeof body.paused !== "boolean") return NextResponse.json({ error: "Paused must be a boolean." }, { status: 400, headers: NO_STORE });
    patch.paused = body.paused;
  }
  if (patch.capital === undefined && patch.paused === undefined) {
    return NextResponse.json({ error: "No supported setting was provided." }, { status: 400, headers: NO_STORE });
  }

  try {
    // A global stop must not queue behind a slow market-data cycle. Fail closed
    // if a simultaneous capital change is later rejected.
    if (patch.paused === true) await saveRuntimeSettings({ paused: true });
    if (patch.capital === undefined) {
      return NextResponse.json({ ...await saveRuntimeSettings(patch), saved: true }, { headers: NO_STORE });
    }
    const settings = await workspaceTransaction(async state => {
      const allocated = state.algorithms.reduce((sum, algorithm) => sum + algorithm.budget, 0);
      if (patch.capital !== undefined && patch.capital < allocated) throw new Error("Paper capital cannot be less than allocated algorithm budgets.");
      return saveRuntimeSettings(patch);
    }, false);
    return NextResponse.json({ ...settings, saved: true }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save settings." },
      { status: 409, headers: NO_STORE },
    );
  }
}
