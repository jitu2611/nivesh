import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const broker = vi.hoisted(() => vi.fn());
vi.mock("./kite-mcp", () => ({ kiteMcp: { callReadOnly: broker }, resultData: (r: { data: unknown }) => r.data, resultText: (r: { text?: string }) => r.text || "" }));
import { optionQuote, resolveOption, underlyingQuote } from "./index-options-data";
const runtime = globalThis as typeof globalThis & { indexChains?: unknown; indexBars?: unknown };
const timestamp = "2026-10-23T10:30:00+05:30";
const quote = { timestamp, last_trade_time: timestamp, depth: { buy: [{ price: 100, quantity: 1000 }], sell: [{ price: 101, quantity: 1000 }] } };
const contract = { instrument_token: 1, exchange: "NFO", segment: "NFO-OPT", name: "NIFTY", instrument_type: "CE", tradingsymbol: "NIFTY26OCT25000CE", expiry: "2026-10-29", strike: 25000, lot_size: 75, tick_size: 0.05 };
describe("read-only index-option market adapter", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T05:00:00Z")); broker.mockReset(); delete runtime.indexChains; delete runtime.indexBars; });
  afterEach(() => { vi.useRealTimers(); delete runtime.indexChains; delete runtime.indexBars; });
  it("uses the actual index spot/token and index timestamp, not a fictional trade time", async () => {
    broker.mockResolvedValue({ data: { "NSE:NIFTY BANK": { instrument_token: 260105, last_price: 55000, timestamp } } });
    expect(await underlyingQuote("BANKNIFTY")).toEqual({ price: 55000, token: 260105 });
    expect(broker).toHaveBeenCalledWith("get_quotes", { instruments: ["NSE:NIFTY BANK"] });
  });
  it("requires fresh trade timestamps, valid bid/ask depth and an acceptable spread", async () => {
    broker.mockResolvedValue({ data: { "NFO:TEST": quote } });
    expect(await optionQuote("NFO:TEST")).toMatchObject({ bid: 100, ask: 101, bidUnits: 1000 });
    broker.mockResolvedValue({ data: { "NFO:TEST": { ...quote, last_trade_time: "2026-10-22T10:30:00+05:30" } } });
    await expect(optionQuote("NFO:TEST")).rejects.toThrow("two minutes");
    broker.mockResolvedValue({ data: { "NFO:TEST": { ...quote, depth: { buy: [{ price: 50, quantity: 1000 }], sell: [{ price: 100, quantity: 1000 }] } } } });
    await expect(optionQuote("NFO:TEST")).rejects.toThrow("spread");
  });
  it("follows paginated contract data before selecting ATM and caches the complete chain", async () => {
    broker.mockImplementation(async (tool: string, args: Record<string, unknown>) => {
      if (tool === "get_quotes") return { data: { "NSE:NIFTY 50": { timestamp, last_price: 25010, instrument_token: 256265 } } };
      if (tool === "search_instruments") return args.from === 0 ? { data: { instruments: [{ ...contract, instrument_token: 2, strike: 26000, tradingsymbol: "NIFTY26OCT26000CE" }], pagination: { total: 2, has_more: true, next_from: 1 } } } : { data: { instruments: [contract], pagination: { total: 2, has_more: false } } };
      throw new Error("Unexpected tool");
    });
    expect((await resolveOption("NIFTY", "CE")).strike).toBe(25000);
    expect(broker.mock.calls.filter(([tool]) => tool === "search_instruments").map(([, args]) => args.from)).toEqual([0, 1]);
    await resolveOption("NIFTY", "CE"); expect(broker.mock.calls.filter(([tool]) => tool === "search_instruments")).toHaveLength(2);
    expect(broker.mock.calls.every(([tool]) => ["get_quotes", "search_instruments"].includes(tool))).toBe(true);
  });
  it("rejects a repeated/incomplete contract page rather than picking from a partial chain", async () => {
    broker.mockResolvedValue({ data: { instruments: [contract], pagination: { total: 2, has_more: true } } });
    await expect(resolveOption("NIFTY", "CE")).rejects.toThrow("repeated a page");
  });
});
