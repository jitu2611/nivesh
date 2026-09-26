import "server-only";

import { copyFile, mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { ResearchWorkflow } from "@/lib/types";

const directory = process.env.NIVESH_DATA_DIR || join(process.cwd(), ".nivesh-data");
const researchFile = join(directory, "latest-research.json");

function parseWorkflow(value: unknown): ResearchWorkflow {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Stored research is invalid.");
  const workflow = value as Partial<ResearchWorkflow>;
  if (typeof workflow.id !== "string" || typeof workflow.completedAt !== "string" || !Array.isArray(workflow.reports) || !workflow.verdict || workflow.mode !== "research-only") {
    throw new Error("Stored research is invalid.");
  }
  return workflow as ResearchWorkflow;
}

async function parseFile(path: string) {
  return parseWorkflow(JSON.parse(await readFile(path, "utf8")));
}

export async function getLatestResearch(): Promise<ResearchWorkflow | undefined> {
  try {
    return await parseFile(researchFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    try {
      return await parseFile(`${researchFile}.bak`);
    } catch {
      throw new Error(`Stored research is corrupted: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}

export async function saveLatestResearch(workflow: ResearchWorkflow) {
  const validated = parseWorkflow(workflow);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await parseFile(researchFile);
    await copyFile(researchFile, `${researchFile}.bak`);
  } catch {
    // Keep an existing good backup when the primary file is absent or invalid.
  }
  const temporary = `${researchFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, researchFile);
}
