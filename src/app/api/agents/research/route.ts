import { NextRequest, NextResponse } from "next/server";
import { runResearchWorkflow } from "@/lib/pi-research";
import { getLatestResearch, saveLatestResearch } from "@/lib/research-store";
import { authorizeMutation } from "@/lib/request-security";
import { getRuntimeSettings } from "@/lib/runtime-store";
import type { ResearchWorkflow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const globalResearch = globalThis as typeof globalThis & {
  niveshResearchRun?: Promise<ResearchWorkflow>;
  niveshLastResearchAt?: number;
  niveshLatestResearch?: ResearchWorkflow;
};

export async function GET() {
  try {
    if (globalResearch.niveshLatestResearch) {
      return NextResponse.json(globalResearch.niveshLatestResearch, { headers: { "cache-control": "no-store" } });
    }
    const result = await getLatestResearch();
    if (!result) return NextResponse.json({ result: null }, { headers: { "cache-control": "no-store" } });
    globalResearch.niveshLatestResearch = result;
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Stored research could not be read." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  if (!authorizeMutation(request, "run-research")) {
    return NextResponse.json({ error: "Research request was not authorized by the Nivesh UI." }, { status: 403 });
  }

  const settings = await getRuntimeSettings();
  if (settings.paused) {
    return NextResponse.json({ error: "Simulation is paused." }, { status: 409, headers: { "cache-control": "no-store" } });
  }

  if (globalResearch.niveshResearchRun) {
    return NextResponse.json({ error: "A research workflow is already running." }, { status: 409 });
  }

  const lastRun = globalResearch.niveshLastResearchAt ?? 0;
  if (Date.now() - lastRun < 5 * 60_000) {
    return NextResponse.json({ error: "Please wait five minutes before starting another full research workflow." }, { status: 429 });
  }

  const run = runResearchWorkflow();
  globalResearch.niveshResearchRun = run;
  globalResearch.niveshLastResearchAt = Date.now();

  try {
    const result = await run;
    await saveLatestResearch(result);
    globalResearch.niveshLatestResearch = result;
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Pi research workflow failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "The pi research workflow could not complete. No trade action was taken." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  } finally {
    globalResearch.niveshResearchRun = undefined;
  }
}
