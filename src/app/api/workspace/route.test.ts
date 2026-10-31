import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { WorkspaceState } from "@/lib/workspace-types";
const mocks = vi.hoisted(() => ({ state: { version: 1, algorithms: [], events: [] } as WorkspaceState, run: vi.fn(), analyse: vi.fn(), sync: vi.fn(), paused: false }));
vi.mock("@/lib/workspace-store", () => ({ workspaceTransaction: async (fn: (s: WorkspaceState) => unknown) => fn(mocks.state), logEvent: vi.fn() }));
vi.mock("@/lib/runtime-store", () => ({ getRuntimeSettings: async () => ({ capital: 100000, paused: mocks.paused }) }));
vi.mock("@/lib/algorithm-runner", () => ({ runAlgorithms: mocks.run }));
vi.mock("@/lib/buy-sync", () => ({ syncLastBuys: mocks.sync }));
vi.mock("@/lib/portfolio-analysis", () => ({ analysePortfolio: mocks.analyse }));
vi.mock("@/lib/portfolio", () => ({ readPortfolio: vi.fn() }));
import { POST } from "./route";
const config = { action: "create", name: "NIFTY ORB", market: "index-options", index: "NIFTY", strategy: "orb", budget: 60000, stopPercent: 20, targetPercent: 40, maxLots: 1, maxTradesPerDay: 3 };
function request(body: object, authorized = true) {
  return new NextRequest("http://127.0.0.1:3000/api/workspace", { method: "POST", headers: authorized ? { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "x-nivesh-action": "workspace", "content-type": "application/json" } : {}, body: JSON.stringify(body) });
}
describe("workspace API", () => {
  beforeEach(() => { mocks.state = { version: 1, algorithms: [], events: [] }; mocks.paused = false; vi.clearAllMocks(); });
  it("rejects unauthorized mutations before executing anything", async () => {
    expect((await POST(request({ action: "tick" }, false))).status).toBe(403); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("captures buy fills in worker-only mode without configured algorithms", async () => {
    expect((await POST(request({ action: "tick" }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledTimes(1); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("keeps read-only buy capture active while paper execution is paused", async () => {
    await POST(request(config)); mocks.state.algorithms[0].enabled = true; mocks.paused = true;
    expect((await POST(request({ action: "tick" }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledTimes(1); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("creates disabled strategies and caps their combined budgets", async () => {
    expect((await POST(request(config))).status).toBe(200);
    expect(mocks.state.algorithms[0].enabled).toBe(false);
    expect(mocks.state.algorithms[0].cash).toBe(60000);
    expect((await POST(request(config))).status).toBe(400);
    expect(mocks.state.algorithms).toHaveLength(1);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("toggles a saved strategy and protects open positions from deletion", async () => {
    await POST(request(config)); const a = mocks.state.algorithms[0];
    await POST(request({ action: "toggle", id: a.id })); expect(a.enabled).toBe(true);
    a.positions.push({ instrument: "NSE:INFY", quantity: 1, entry: 100, mark: 100, cost: 101, openedAt: new Date().toISOString() });
    expect((await POST(request({ action: "delete", id: a.id }))).status).toBe(400);
    expect(mocks.state.algorithms).toHaveLength(1);
  });
});
