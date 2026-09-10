import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { runResearchWorkflow } from "@/lib/pi-research";
import type { ResearchWorkflow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const globalResearch = globalThis as typeof globalThis & {
  niveshResearchRun?: Promise<ResearchWorkflow>;
  niveshLastResearchAt?: number;
  niveshLatestResearch?: ResearchWorkflow;
};

const dataDirectory = join(process.cwd(), ".nivesh-data");
const latestResearchFile = join(dataDirectory, "latest-research.json");

async function persistLatest(result: ResearchWorkflow) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const temporary = `${latestResearchFile}.tmp`;
  await writeFile(temporary, JSON.stringify(result), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, latestResearchFile);
  globalResearch.niveshLatestResearch = result;
}

export async function GET() {
  try {
    if (globalResearch.niveshLatestResearch) {
      return NextResponse.json(globalResearch.niveshLatestResearch, { headers: { "cache-control": "no-store" } });
    }
    const result = JSON.parse(await readFile(latestResearchFile, "utf8")) as ResearchWorkflow;
    globalResearch.niveshLatestResearch = result;
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ result: null }, { headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expectedOrigin = request.nextUrl.origin;
  const action = request.headers.get("x-nivesh-action");
  if (origin !== expectedOrigin || action !== "run-research") {
    return NextResponse.json({ error: "Research request was not authorized by the Nivesh UI." }, { status: 403 });
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
    await persistLatest(result);
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
