import { describe, expect, it } from "vitest";
import { technicalSignal, wilderRsi } from "./technical-strategies";
import type { DailyClose } from "./historical-prices";
const now = new Date("2026-10-25T06:00:00Z");
function candles(values: number[]): DailyClose[] {
  return values.map((close, i) => ({ day: new Date(Date.UTC(2026, 9, 24) - (values.length - i - 1) * 86400000).toISOString().slice(0, 10), close, high: close + 1, low: close - 1 }));
}
describe("classic daily paper signals", () => {
  it("detects a true 50/200 cross, not just an established bullish trend", () => {
    const cross = candles([...Array(150).fill(100), ...Array(50).fill(99), 151]);
    expect(technicalSignal("sma-cross", cross, now).enter).toBe(true);
    expect(technicalSignal("sma-cross", candles(Array(201).fill(100)), now).enter).toBe(false);
    expect(technicalSignal("sma-cross", candles([...Array(150).fill(100), ...Array(50).fill(101), 49]), now).exit).toBe(true);
    expect(() => technicalSignal("sma-cross", candles(Array(200).fill(100)), now)).toThrow("201");
  });
  it("implements Wilder RSI and buys recovery, not continued oversold weakness", () => {
    const falling = Array.from({ length: 100 }, (_, i) => 200 - i);
    expect(wilderRsi(falling).at(-1)).toBe(0);
    expect(wilderRsi(Array.from({ length: 100 }, (_, i) => i + 1)).at(-1)).toBe(100);
    expect(wilderRsi(Array(100).fill(100)).at(-1)).toBe(50);
    expect(technicalSignal("rsi", candles(falling), now).enter).toBe(false);
    expect(technicalSignal("rsi", candles([...falling, 125]), now).enter).toBe(true);
    expect(technicalSignal("rsi", candles([...falling, 200]), now).exit).toBe(true);
    expect(() => technicalSignal("rsi", candles(Array(99).fill(100)), now)).toThrow("100");
  });
  it("excludes the signal candle from Donchian channels and uses real highs/lows", () => {
    const breakout = candles([...Array(20).fill(100), 102]);
    expect(technicalSignal("channel-breakout", breakout, now).enter).toBe(true);
    expect(technicalSignal("channel-breakout", candles([...Array(20).fill(100), 101]), now).enter).toBe(false);
    expect(technicalSignal("channel-breakout", candles([...Array(20).fill(100), 98]), now).exit).toBe(true);
    expect(() => technicalSignal("channel-breakout", breakout.map(({ day, close }) => ({ day, close })), now)).toThrow("highs/lows");
  });
  it("never uses today's incomplete candle or stale daily data", () => {
    const data = candles(Array(201).fill(100));
    data.push({ day: "2026-10-25", close: 100000 });
    const result = technicalSignal("sma-cross", data, now);
    expect(result.day).toBe("2026-10-24"); expect(result.enter).toBe(false);
    expect(() => technicalSignal("sma-cross", data, new Date("2026-11-25T06:00:00Z"))).toThrow("Recent completed");
  });
});
