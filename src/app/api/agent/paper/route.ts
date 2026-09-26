import { NextRequest, NextResponse } from "next/server";
import { executeLatestPaperIntent } from "@/lib/paper-trading";
import { getLatestResearch } from "@/lib/research-store";
import { authorizeMutation } from "@/lib/request-security";
import { getRuntimeSettings } from "@/lib/runtime-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!authorizeMutation(request, "execute-paper-intent")) {
    return NextResponse.json({ error: "Paper execution request was not authorized by the Nivesh UI." }, { status: 403 });
  }

  try {
    const settings = await getRuntimeSettings();
    if (settings.paused) return NextResponse.json({ error: "Simulation is paused." }, { status: 409, headers: { "cache-control": "no-store" } });
    const workflow = await getLatestResearch();
    if (!workflow) return NextResponse.json({ error: "No research workflow is available." }, { status: 404, headers: { "cache-control": "no-store" } });
    const result = await executeLatestPaperIntent(workflow);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Paper execution failed." },
      { status: 409, headers: { "cache-control": "no-store" } },
    );
  }
}
