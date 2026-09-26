import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function isolatedStore() {
  const directory = await mkdtemp(join(tmpdir(), "nivesh-store-"));
  directories.push(directory);
  vi.stubEnv("NIVESH_DATA_DIR", directory);
  vi.resetModules();
  return { directory, store: await import("./runtime-store") };
}

describe("runtime store", () => {
  it("creates and updates a simulation-only state atomically", async () => {
    const { directory, store } = await isolatedStore();
    const initial = await store.getBotSleeve();
    expect(initial.mode).toBe("simulation");
    expect(initial.revision).toBe(0);

    const settings = await store.saveRuntimeSettings({ capital: 2_000_000, paused: true });
    const sleeve = await store.getBotSleeve();
    expect(settings).toMatchObject({ capital: 2_000_000, paused: true, mode: "simulation" });
    expect(sleeve).toMatchObject({ capital: 2_000_000, cash: 2_000_000, revision: 1 });

    const persisted = JSON.parse(await readFile(join(directory, "runtime.json"), "utf8"));
    expect(persisted.version).toBe(1);
  });

  it("rejects stale ledger writes", async () => {
    const { store } = await isolatedStore();
    const stale = await store.getBotSleeve();
    await store.saveRuntimeSettings({ paused: true });
    await expect(store.saveBotSleeve(stale)).rejects.toThrow("changed during this operation");
  });

  it("recovers from the last valid backup instead of silently resetting", async () => {
    const { directory, store } = await isolatedStore();
    await store.saveRuntimeSettings({ capital: 2_000_000 });
    await store.saveRuntimeSettings({ paused: true });
    await writeFile(join(directory, "runtime.json"), "{broken", "utf8");

    vi.resetModules();
    const recoveredStore = await import("./runtime-store");
    const recovered = await recoveredStore.getRuntimeSettings();
    expect(recovered.capital).toBe(2_000_000);
    expect(recovered.mode).toBe("simulation");
  });
});
