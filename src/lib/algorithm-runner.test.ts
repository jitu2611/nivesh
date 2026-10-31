import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceState } from "./workspace-types";
const mocks = vi.hoisted(() => ({ settings: vi.fn(), clock: vi.fn(), quote: vi.fn(), bars: vi.fn(), resolve: vi.fn(), signal: vi.fn() }));
vi.mock("./runtime-store", () => ({ getRuntimeSettings: mocks.settings }));
vi.mock("./index-options-data", () => ({ optionQuote: mocks.quote, loadIndexBars: mocks.bars, resolveOption: mocks.resolve }));
vi.mock("./index-options-policy", async original => ({ ...await original<typeof import("./index-options-policy")>(), indexSignal: mocks.signal }));
vi.mock("./paper-policy", async original => ({ ...await original<typeof import("./paper-policy")>(), marketClock: mocks.clock }));
import { runAlgorithms } from "./algorithm-runner";
function state(): WorkspaceState {
  return { version: 1, events: [], algorithms: [{ id: "one", name: "NIFTY ORB", market: "index-options", index: "NIFTY", strategy: "orb", symbols: [], scope: "symbols", lookback: 7, threshold: 3, budget: 250000, stopPercent: 20, targetPercent: 40, maxLots: 1, maxTradesPerDay: 3, enabled: true, cash: 250000, realisedPnl: 0, positions: [] }] };
}
describe("index-option paper execution", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T05:00:00Z"));
    mocks.settings.mockResolvedValue({ paused: false, capital: 1000000 }); mocks.clock.mockReturnValue({ open: true, minutes: 630 });
    mocks.bars.mockResolvedValue([]); mocks.signal.mockImplementation(() => ({ id: "signal", at: Date.now(), direction: "CE", exitCall: false, exitPut: false, reason: "Index breakout" }));
    mocks.resolve.mockResolvedValue({ instrument: "NFO:NIFTY26OCT25000CE", index: "NIFTY", type: "CE", expiry: "2026-10-29", strike: 25000, lotSize: 75, tickSize: 0.05 });
    mocks.quote.mockResolvedValue({ bid: 100, ask: 101, bidUnits: 10000, askUnits: 10000 });
  });
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
  it("buys a verified whole option lot at ask with costs and ignores duplicate cycles", async () => {
    const s = state(); await runAlgorithms(s); const a = s.algorithms[0];
    expect(a.positions).toHaveLength(1); expect(a.positions[0].quantity).toBe(75); expect(a.positions[0].entry).toBeGreaterThan(101);
    expect(a.positions[0].option?.type).toBe("CE"); expect(a.cash).toBeGreaterThan(a.budget * 0.2); expect(a.trades?.[0].side).toBe("BUY");
    await runAlgorithms(s); expect(a.positions).toHaveLength(1); expect(mocks.resolve).toHaveBeenCalledTimes(1);
  });
  it("routes bearish BANKNIFTY signals to an actual PE and fetched lot size", async () => {
    const s = state(); s.algorithms[0].index = "BANKNIFTY";
    mocks.signal.mockReturnValue({ id: "down", at: Date.now(), direction: "PE", exitCall: false, exitPut: false, reason: "Index breakdown" });
    mocks.resolve.mockResolvedValue({ instrument: "NFO:BANKNIFTY26OCT55000PE", index: "BANKNIFTY", type: "PE", expiry: "2026-10-29", strike: 55000, lotSize: 35, tickSize: 0.05 });
    await runAlgorithms(s); expect(mocks.resolve).toHaveBeenCalledWith("BANKNIFTY", "PE"); expect(s.algorithms[0].positions[0].quantity).toBe(35);
  });
  it("never uses fractional lots to make an unaffordable contract fit", async () => {
    const s = state(); s.algorithms[0].budget = 10000; s.algorithms[0].cash = 10000;
    await runAlgorithms(s); expect(s.algorithms[0].positions).toEqual([]); expect(s.events[0].details).toContain("full option lot");
  });
  it("checks depth and fresh data; a blocked provider never fabricates a fill", async () => {
    const s = state(); mocks.quote.mockResolvedValue({ bid: 100, ask: 101, bidUnits: 1, askUnits: 1 });
    await runAlgorithms(s); expect(s.algorithms[0].positions).toEqual([]);
    vi.advanceTimersByTime(61000); mocks.quote.mockRejectedValue(new Error("Quote stale"));
    await runAlgorithms(s); expect(s.algorithms[0].positions).toEqual([]);
  });
  it("exits on premium stops even when index history is unavailable, with entries disabled", async () => {
    const s = state(); await runAlgorithms(s); const a = s.algorithms[0]; a.enabled = false; vi.advanceTimersByTime(61000);
    mocks.quote.mockResolvedValue({ bid: 70, ask: 71, bidUnits: 10000, askUnits: 10000 }); mocks.bars.mockRejectedValue(new Error("History unavailable"));
    await runAlgorithms(s); expect(a.positions).toEqual([]); expect(a.trades?.[0].side).toBe("SELL"); expect(a.realisedPnl).toBeLessThan(0); expect(a.cash).toBeCloseTo(a.budget + a.realisedPnl);
  });
  it("rejects late entries and forces 15:15 exits when fresh depth exists", async () => {
    const s = state(); mocks.clock.mockReturnValue({ open: true, minutes: 14 * 60 + 45 });
    await runAlgorithms(s); expect(s.algorithms[0].positions).toEqual([]);
    vi.advanceTimersByTime(61000); mocks.clock.mockReturnValue({ open: true, minutes: 630 }); await runAlgorithms(s);
    vi.advanceTimersByTime(61000); mocks.clock.mockReturnValue({ open: true, minutes: 15 * 60 + 15 }); mocks.bars.mockRejectedValue(new Error("History down"));
    await runAlgorithms(s); expect(s.algorithms[0].positions).toEqual([]); expect(s.algorithms[0].trades?.[0].reason).toContain("15:15");
  });
  it("does not re-enter a consumed signal after a premium stop closes the position", async () => {
    const s = state(), at = Date.now();
    mocks.signal.mockReturnValue({ id: "same-bar", at, direction: "CE", exitCall: false, exitPut: false, reason: "Same completed bar" });
    await runAlgorithms(s); vi.advanceTimersByTime(61000); mocks.quote.mockResolvedValue({ bid: 70, ask: 71, bidUnits: 10000, askUnits: 10000 });
    await runAlgorithms(s); expect(s.algorithms[0].positions).toEqual([]);
    vi.advanceTimersByTime(61000); mocks.quote.mockResolvedValue({ bid: 100, ask: 101, bidUnits: 10000, askUnits: 10000 });
    await runAlgorithms(s); expect(s.algorithms[0].positions).toEqual([]); expect(s.algorithms[0].trades).toHaveLength(2);
  });
  it("enforces daily entry and loss guards", async () => {
    const s = state(), a = s.algorithms[0]; a.session = { day: "2026-10-23", startValue: 250000, entries: 3 };
    await runAlgorithms(s); expect(mocks.resolve).not.toHaveBeenCalled();
    vi.advanceTimersByTime(61000); a.session.entries = 0; a.cash = 230000;
    await runAlgorithms(s); expect(mocks.resolve).not.toHaveBeenCalled(); expect(s.events[0].details).toContain("Daily loss");
  });
  it("retains expired unresolved positions rather than inventing a settlement", async () => {
    const s = state(); await runAlgorithms(s); const p = s.algorithms[0].positions[0]; p.option!.expiry = "2026-10-22";
    vi.advanceTimersByTime(61000); await runAlgorithms(s);
    expect(s.algorithms[0].positions).toHaveLength(1); expect(s.events[0].details).toContain("settlement is unresolved");
  });
  it("fails closed for legacy equity configs, global pause, and closed sessions", async () => {
    const s = state(); s.algorithms[0].market = undefined; await runAlgorithms(s); expect(s.algorithms[0].enabled).toBe(false); expect(mocks.resolve).not.toHaveBeenCalled();
    mocks.settings.mockResolvedValue({ paused: true }); await expect(runAlgorithms(state())).rejects.toThrow("paused");
    mocks.settings.mockResolvedValue({ paused: false, capital: 1000000 }); mocks.clock.mockReturnValue({ open: false, minutes: 900 });
    await runAlgorithms(state()); expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
