import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
let directory = "";
describe("index-option migration", () => {
  beforeEach(async () => { vi.resetModules(); directory = await mkdtemp(join(tmpdir(), "nivesh-workspace-test-")); vi.stubEnv("NIVESH_DATA_DIR", directory); });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
  it("archives old equity rules disabled without selling, losing positions, or consuming new option budgets", async () => {
    const legacy = { id: "legacy", name: "Old stock rule", strategy: "dip", enabled: true, cash: 9900, budget: 10000, positions: [{ instrument: "NSE:INFY", quantity: 1, entry: 100, mark: 110, cost: 100, openedAt: "2026-10-22T05:00:00Z" }] };
    await writeFile(join(directory, "workspace.json"), JSON.stringify({ version: 1, algorithms: [legacy], events: [] }));
    const { workspaceTransaction } = await import("./workspace-store");
    const migrated = await workspaceTransaction(s => s);
    expect(migrated.algorithms).toEqual([]); expect(migrated.archivedAlgorithms).toHaveLength(1);
    expect(migrated.archivedAlgorithms?.[0]).toMatchObject({ id: "legacy", enabled: false, cash: 9900, positions: legacy.positions });
    const persisted = JSON.parse(await readFile(join(directory, "workspace.json"), "utf8"));
    expect(persisted.algorithms).toEqual([]); expect(persisted.archivedAlgorithms[0].positions).toEqual(legacy.positions);
    const again = await workspaceTransaction(s => s, false); expect(again.archivedAlgorithms).toHaveLength(1);
  });
});
