import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const broker = vi.hoisted(() => vi.fn());
vi.mock("./kite-mcp", () => ({ kiteMcp: { callReadOnly: broker }, resultData: (r: { data: unknown }) => r.data, resultText: (r: { text?: string }) => r.text || "" }));
import { readMutualFunds } from "./mutual-funds-service";
const runtime = globalThis as typeof globalThis & { niveshMutualFunds?: unknown; niveshMutualFundsRun?: unknown };
describe("read-only mutual-fund service", () => {
  beforeEach(() => { delete runtime.niveshMutualFunds; delete runtime.niveshMutualFundsRun; broker.mockReset(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T10:00:00Z")); });
  afterEach(() => { delete runtime.niveshMutualFunds; delete runtime.niveshMutualFundsRun; vi.useRealTimers(); });
  it("only calls the read-only MF tool, deduplicates requests and caches for five minutes", async () => {
    broker.mockResolvedValue({ data: [] });
    const [a, b] = await Promise.all([readMutualFunds(), readMutualFunds()]);
    expect(a).toEqual(b); expect(broker).toHaveBeenCalledTimes(1); expect(broker).toHaveBeenCalledWith("get_mf_holdings");
    vi.advanceTimersByTime(4 * 60000); await readMutualFunds(); expect(broker).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61000); await readMutualFunds(); expect(broker).toHaveBeenCalledTimes(2);
  });
  it("does not cache errors or turn provider errors into an empty fund portfolio", async () => {
    broker.mockResolvedValue({ isError: true, text: "Please log in first" });
    await expect(readMutualFunds()).rejects.toThrow("log in"); expect(runtime.niveshMutualFunds).toBeUndefined();
    expect(runtime.niveshMutualFundsRun).toBeUndefined();
    broker.mockResolvedValue({ data: [] }); await expect(readMutualFunds()).resolves.toMatchObject({ holdings: [] });
    expect(broker).toHaveBeenCalledTimes(2);
  });
});
