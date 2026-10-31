import "server-only";
import { mkdir, readFile, open, rename } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceState } from "./workspace-types";
const directory = process.env.NIVESH_DATA_DIR || join(process.cwd(), ".nivesh-data");
const file = join(directory, "workspace.json");
const globals = globalThis as typeof globalThis & { workspaceTail?: Promise<unknown> };
async function read(): Promise<WorkspaceState> {
  try {
    const state = JSON.parse(await readFile(file, "utf8")) as WorkspaceState;
    if (state.version !== 1 || !Array.isArray(state.algorithms) || !Array.isArray(state.events)) throw new Error("Invalid workspace data.");
    const legacy = state.algorithms.filter(algorithm => algorithm.market !== "index-options");
    if (legacy.length) {
      state.archivedAlgorithms = [...(state.archivedAlgorithms || []), ...legacy.map(algorithm => ({ ...algorithm, enabled: false }))];
      state.algorithms = state.algorithms.filter(algorithm => algorithm.market === "index-options");
      logEvent(state, "algorithm", `Archived ${legacy.length} legacy equity paper strategies`, "No positions sold or converted. Historical balances/positions retained separately; only new index-option strategies may run.");
    }
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, algorithms: [], events: [] };
    throw error;
  }
}
export async function workspaceTransaction<T>(operation: (state: WorkspaceState) => Promise<T> | T, write = true): Promise<T> {
  const previous = globals.workspaceTail ?? Promise.resolve();
  let release!: () => void;
  globals.workspaceTail = new Promise<void>(resolve => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    const state = await read();
    const result = await operation(state);
    if (write) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, file);
    }
    return result;
  } finally { release(); }
}
export function logEvent(state: WorkspaceState, category: WorkspaceState["events"][number]["category"], message: string, details?: string) {
  state.events.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), category, message, details });
  state.events = state.events.slice(0, 1000);
}
