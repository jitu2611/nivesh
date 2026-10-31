import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const broker = vi.hoisted(() => vi.fn());
vi.mock("./kite-mcp", () => ({ kiteMcp: { callReadOnly: broker }, resultData: (r: { data: unknown }) => r.data, resultText: (r: { text?: string }) => r.text || "" }));
import { analysePortfolio, priceHistory } from "./portfolio-analysis";
describe("historical price fetch", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T10:00:00Z")); (globalThis as typeof globalThis & { niveshDailyCloses?: Map<unknown, unknown> }).niveshDailyCloses?.clear(); broker.mockReset(); });
  afterEach(() => vi.useRealTimers());
  it("calculates changes from object-form MCP candles and caches successful history", async () => {
    broker.mockImplementation(async (tool: string) => tool === "get_quotes" ? { data: { "NSE:INFY": { instrument_token: 408065, last_price: 110 } } } : { data: [{ date: "2026-10-23T00:00:00+0530", close: 100 }, { date: "2026-10-22T00:00:00+0530", close: 80 }] });
    const row = await priceHistory("NSE:INFY", 10, 90);
    expect(row.error).toBeUndefined(); expect(row.changes[1]).toBeCloseTo(10); expect(row.changes[3]).toBeCloseTo(37.5); expect(row.changes[30]).toBeNull();
    await priceHistory("NSE:INFY");
    expect(broker.mock.calls.filter(([tool]) => tool === "get_historical_data")).toHaveLength(1);
  });
  it("upgrades old short-history caches and exposes long-term health only at portfolio level", async () => {
    (globalThis as typeof globalThis & { niveshDailyCloses?: Map<unknown, unknown> }).niveshDailyCloses?.set(408065, { at: Date.now(), day: "2026-10-25", days: 45, closes: [{ day: "2026-10-23", close: 100 }] });
    broker.mockImplementation(async (tool: string) => tool === "get_quotes" ? { data: { "NSE:INFY": { instrument_token: 408065, last_price: 110 } } } : { data: [{ date: "2026-10-23", close: 100 }, { date: "2026-04-24", close: 80 }, { date: "2025-10-24", close: 55 }] });
    const result = await analysePortfolio({ holdings: [{ symbol: "INFY", exchange: "NSE", company: "INFY", quantity: 10, average: 90, ltp: 110, managed: false }], availableCash: 1000, totalValue: 1100, totalPnl: 200, asOf: new Date().toISOString(), source: "kite" });
    expect(result.health?.["6m"]).toMatchObject({ changeAmount: 300, changePercent: 37.5, covered: 1, total: 1 });
    expect(result.health?.["1y"]).toMatchObject({ changeAmount: 550, changePercent: 100, covered: 1, total: 1 });
    expect(Object.keys(result.changes)).toEqual(["1", "3", "7", "30"]); // Existing holdings columns stay short-term.
    const historyCalls = broker.mock.calls.filter(([tool]) => tool === "get_historical_data");
    expect(historyCalls).toHaveLength(1);
    expect(historyCalls[0][1].from_date.slice(0, 10) < "2025-10-24").toBe(true);
    expect(result.methodology).toContain("not actual account profit");
  });
  it("reports unusable historical schemas as errors instead of a silent success", async () => {
    broker.mockImplementation(async (tool: string) => tool === "get_quotes" ? { data: { "NSE:INFY": { instrument_token: 408065, last_price: 110 } } } : { data: [{ unsupported: "2026-10-23", close: 100 }] });
    expect((await priceHistory("NSE:INFY")).error).toContain("no usable dated");
  });
  it("provides actionable gateway failures without passing HTML into the UI", async () => {
    broker.mockResolvedValue({ isError: true, text: "<!DOCTYPE html><html>Just a moment...Cloudflare</html>" });
    const row = await priceHistory("NSE:INFY"); expect(row.error).toContain("upstream security gateway"); expect(row.error).not.toContain("<html>"); expect(row.changes[1]).toBeNull();
  });
});
