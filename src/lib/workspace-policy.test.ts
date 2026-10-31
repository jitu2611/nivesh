import { describe, expect, it } from "vitest";
import { analysisSymbols, buildSuggestions, entrySignal, parseAlgorithm, weightedChanges } from "./workspace-policy";
import type { PriceRow } from "./workspace-types";
const row = (instrument: string, price: number, quantity: number, change: number | null): PriceRow => ({ instrument, price, quantity, average: price, changes: { 1: change, 3: change, 7: change, 30: change } });
const config = { name: "NIFTY ORB", market: "index-options", index: "NIFTY", strategy: "orb", budget: 250000, stopPercent: 20, targetPercent: 40, maxLots: 1, maxTradesPerDay: 3 };
describe("workspace policies", () => {
  it("separates portfolio research symbols from index-option execution", () => {
    expect(analysisSymbols("INFY, NSE:TCS, INFY")).toEqual(["NSE:INFY", "NSE:TCS"]);
    expect(parseAlgorithm(config)).toMatchObject({ market: "index-options", index: "NIFTY", strategy: "orb", symbols: [] });
    expect(parseAlgorithm({ ...config, index: "BANKNIFTY" }).index).toBe("BANKNIFTY");
  });
  it("rejects stock/portfolio execution, other indices and unsafe inputs", () => {
    for (const patch of [{ symbols: "NSE:INFY" }, { scope: "portfolio" }, { market: "equity" }, { index: "FINNIFTY" }, { maxLots: 0.5 }, { maxTradesPerDay: 99 }, { budget: -1 }, { stopPercent: 0 }, { targetPercent: Infinity }, { strategy: "sma-cross" }]) expect(() => parseAlgorithm({ ...config, ...patch })).toThrow();
  });
  it("uses a reconstructed portfolio denominator, not an average of returns", () => {
    const rows = [row("NSE:A", 200, 1, 100), row("NSE:B", 100, 1, 0)];
    expect(weightedChanges(rows)[7]).toBe(50);
  });
  it("does not substitute zero for missing held history or include candidates in returns", () => {
    expect(weightedChanges([row("NSE:A", 100, 1, null)])[1]).toBeNull();
    expect(weightedChanges([row("NSE:A", 100, 1, 5), row("NSE:B", 100, 0, null)])[1]).toBeCloseTo(5);
    expect(weightedChanges([])[1]).toBeNull();
  });
  it("keeps additions within unreserved cash without assuming sale proceeds", () => {
    const suggestions = buildSuggestions([row("NSE:A", 100, 100, 0), row("NSE:B", 100, 0, 0), row("NSE:C", 100, 0, 0)], 1000);
    const additions = suggestions.filter(s => s.action === "ADD");
    expect(additions.reduce((s, r) => s + r.amount * 1.002, 0)).toBeLessThanOrEqual(800);
    expect(suggestions[0].action).toBe("REDUCE");
    expect(buildSuggestions([row("NSE:A", 100, 100, 0), row("NSE:B", 100, 0, 0)], 0).filter(s => s.action === "ADD")).toEqual([]);
  });
  it("does not suggest trades with partial or failed price data", () => {
    expect(buildSuggestions([row("NSE:A", 0, 10, null)], 1000)).toEqual([]);
    expect(buildSuggestions([{ ...row("NSE:A", 100, 10, 0), error: "Unavailable" }], 1000)).toEqual([]);
  });
  it("requires actual movement in the chosen direction", () => {
    expect(entrySignal("dip", -3, 3)).toBe(true);
    expect(entrySignal("dip", 3, 3)).toBe(false);
    expect(entrySignal("momentum", 3, 3)).toBe(true);
    expect(entrySignal("momentum", null, 3)).toBe(false);
    expect(entrySignal("dip", NaN, 3)).toBe(false);
  });
});
