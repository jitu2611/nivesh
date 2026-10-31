import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceState } from "./workspace-types";
const broker = vi.hoisted(() => vi.fn());
vi.mock("./kite-mcp", () => ({ kiteMcp: { callReadOnly: broker }, resultData: (r: { data: unknown }) => r.data, resultText: (r: { text?: string }) => r.text || "" }));
import { syncLastBuys } from "./buy-sync";
const previousBuy = { instrument: "NSE:INFY", price: 100, quantity: 5, at: "2026-10-23T04:45:30.000Z", tradeId: "1", source: "console-csv" as const };
function state(): WorkspaceState { return { version: 1, algorithms: [], events: [], lastBuys: { "NSE:INFY": { ...previousBuy } } }; }
describe("saved buy records survive automatic sync", () => {
  beforeEach(() => { broker.mockReset(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T06:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  it("keeps historical buys when today's tradebook is empty", async () => {
    const s = state(); broker.mockResolvedValue({ data: [] }); await syncLastBuys(s);
    expect(s.lastBuys?.["NSE:INFY"]).toEqual(previousBuy); expect(s.buySyncError).toBeUndefined();
  });
  it("keeps saved records on authorization, network or provider failures", async () => {
    const s = state(); broker.mockResolvedValue({ isError: true, text: "Please log in first" }); await syncLastBuys(s);
    expect(s.lastBuys?.["NSE:INFY"]).toEqual(previousBuy); expect(s.buySyncError).toContain("Reconnect Kite");
    vi.advanceTimersByTime(61000); broker.mockRejectedValue(new Error("Network unavailable")); await syncLastBuys(s);
    expect(s.lastBuys?.["NSE:INFY"]).toEqual(previousBuy); expect(s.buySyncError).toBe("Network unavailable");
  });
  it("updates only from a later actual execution and throttles repeated refreshes", async () => {
    const s = state(); broker.mockResolvedValue({ data: [{ tradingsymbol: "INFY", exchange: "NSE", transaction_type: "BUY", product: "CNC", average_price: 110, quantity: 2, fill_timestamp: "2026-10-24 10:15:30", trade_id: "2" }] });
    await syncLastBuys(s); expect(s.lastBuys?.["NSE:INFY"].price).toBe(110);
    await syncLastBuys(s); expect(broker).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61000); broker.mockResolvedValue({ data: [] }); await syncLastBuys(s);
    expect(s.lastBuys?.["NSE:INFY"].price).toBe(110);
  });
});
