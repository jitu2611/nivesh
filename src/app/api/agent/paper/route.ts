import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { executeLatestPaperIntent } from "@/lib/paper-trading";
import type { ResearchWorkflow } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin || request.headers.get("x-nivesh-action") !== "execute-paper-intent") {
    return NextResponse.json({ error: "Paper execution request was not authorized by the Nivesh UI." }, { status: 403 });
  }

  try {
    const latestFile = join(process.cwd(), ".nivesh-data", "latest-research.json");
    const workflow = JSON.parse(await readFile(latestFile, "utf8")) as ResearchWorkflow;
    const result = await executeLatestPaperIntent(workflow);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Paper execution failed." },
      { status: 409, headers: { "cache-control": "no-store" } },
    );
  }
}
