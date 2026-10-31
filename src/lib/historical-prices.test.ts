import { describe, expect, it } from "vitest";
import { historicalChanges, indiaDay, marketDataError, normalizeDailyCloses } from "./historical-prices";
describe("Kite historical candle normalization", () => {
  it("supports raw OHLCV tuples and MCP date/close objects", () => {
    const tuple = normalizeDailyCloses({ data: { candles: [["2026-10-22T00:00:00+0530", 90, 110, 80, 100, 1000]] } });
    const object = normalizeDailyCloses({ result: { data: [{ date: "2026-10-22T00:00:00+05:30", open: 90, high: 110, low: 80, close: 100, volume: 1000 }] } });
    expect(tuple).toEqual([{ day: "2026-10-22", close: 100, high: 110, low: 80 }]); expect(object).toEqual(tuple);
  });
  it("handles timestamp objects, numeric closes and Unix dates", () => {
    expect(normalizeDailyCloses([{ timestamp: "2026-10-22", close: "100" }, { time: Date.parse("2026-10-23T00:00:00+05:30") / 1000, close: 110 }])).toEqual([{ day: "2026-10-22", close: 100 }, { day: "2026-10-23", close: 110 }]);
  });
  it("normalizes UTC candle timestamps to India dates and rejects impossible calendar dates", () => {
    expect(normalizeDailyCloses([{ date: "2026-10-22T18:30:00Z", close: 100 }])).toEqual([{ day: "2026-10-23", close: 100 }]);
    expect(() => normalizeDailyCloses([{ date: "2026-02-31", close: 100 }])).toThrow("no usable");
  });
  it("throws explicitly rather than silently returning all null for unknown candle schemas", () => {
    for (const payload of [[], { error: "failed" }, [{ unexpected_date: "2026-10-23", close: 100 }], [["2026-10-23", 1, 2, 3, Infinity]], [{ date: "invalid", close: 100 }]]) expect(() => normalizeDailyCloses(payload)).toThrow();
  });
  it("uses India dates and the last available session for weekend lookbacks", () => {
    const now = new Date("2026-10-25T10:00:00Z");
    const changes = historicalChanges(110, normalizeDailyCloses([{ date: "2026-10-23", close: 100 }, { date: "2026-10-22", close: 80 }, { date: "2026-10-16", close: 50 }]), now);
    expect(changes[1]).toBeCloseTo(10); expect(changes[3]).toBeCloseTo(37.5); expect(changes[7]).toBeCloseTo(120); expect(changes[30]).toBeNull();
    expect(indiaDay(new Date("2026-10-24T20:00:00Z"))).toBe("2026-10-25");
  });
  it("does not expose gateway HTML, provider URLs or giant diagnostics", () => {
    const error = marketDataError(new Error('mcp-remote: <!DOCTYPE html><html><title>Just a moment...</title>https://challenges.cloudflare.com/private</html>'));
    expect(error).toContain("upstream security gateway"); expect(error).not.toContain("<html>");
    expect(marketDataError(new Error("Please log in first using the login tool"))).toContain("Reconnect Kite");
    expect(marketDataError(new Error("x".repeat(1000)))).toHaveLength(240);
  });
});
