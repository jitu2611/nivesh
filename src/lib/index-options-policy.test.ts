import { describe, expect, it } from "vitest";
import { chooseContract, indexSignal, optionFill, optionSize, parseContract, parseIndexBars, type IndexBar } from "./index-options-policy";
const now = new Date("2026-10-23T04:05:00Z"); // 09:35 IST
const bar = (time: string, close = 100, high = 103, low = 98): IndexBar => ({ at: Date.parse(`2026-10-23T${time}:00+05:30`), open: 100, high, low, close });
const range = [bar("09:15"), bar("09:20"), bar("09:25")];
const metadata = { exchange: "NFO", segment: "NFO-OPT", name: "NIFTY", instrument_type: "CE", tradingsymbol: "NIFTY26OCT25000CE", expiry: "2026-10-29", strike: 25000, lot_size: 75, tick_size: 0.05 };
describe("index option rules", () => {
  it("parses tuple/object intraday candles without inventing malformed prices", () => {
    expect(parseIndexBars({ data: { candles: [["2026-10-23T09:15:00+0530", 100, 103, 98, 101, 0], { date: "2026-10-23T09:20:00+05:30", open: 101, high: 104, low: 100, close: 102 }] } })).toHaveLength(2);
    expect(parseIndexBars([["bad", 1, 2, 3, 4]])).toEqual([]);
  });
  it("ORB buys a CE on a real range break, a PE on breakdown, and ignores an unfinished bar", () => {
    expect(indexSignal("orb", [...range, bar("09:30", 104, 105)], now).direction).toBe("CE");
    expect(indexSignal("orb", [...range, bar("09:30", 97, 103, 96)], now).direction).toBe("PE");
    const result = indexSignal("orb", [...range, bar("09:30", 100), bar("09:35", 1000, 1001)], new Date("2026-10-23T04:07:00Z"));
    expect(result.direction).toBeNull();
    expect(() => indexSignal("orb", [range[0], range[2], bar("09:30", 104, 105)], now)).toThrow("all three");
    expect(() => indexSignal("orb", [...range, bar("09:30", 104, 105)], new Date("2026-10-23T06:00:00Z"))).toThrow("Fresh");
  });
  it("EMA and Wilder RSI give directional signals from completed index bars", () => {
    const series = (values: number[]) => values.map((close, i) => ({ at: now.getTime() - (values.length - i) * 300000, open: close, high: close + 1, low: close - 1, close }));
    expect(indexSignal("ema-crossover", series([...Array(98).fill(100), 99, 150]), now).direction).toBe("CE");
    expect(indexSignal("ema-crossover", series([...Array(98).fill(100), 101, 50]), now).direction).toBe("PE");
    expect(indexSignal("rsi-momentum", series([...Array(99).fill(100), 110]), now).direction).toBe("CE");
    expect(indexSignal("rsi-momentum", series([...Array(99).fill(100), 90]), now).direction).toBe("PE");
    expect(() => indexSignal("ema-crossover", series(Array(99).fill(100)), now)).toThrow("100");
  });
  it("validates identity, exact option metadata and dynamic lot sizes", () => {
    expect(parseContract(metadata, "NIFTY")?.lotSize).toBe(75);
    expect(parseContract({ ...metadata, name: "BANKNIFTY", tradingsymbol: "BANKNIFTY26OCT55000CE", lot_size: 35 }, "BANKNIFTY")?.lotSize).toBe(35);
    for (const patch of [{ name: "FINNIFTY" }, { exchange: "NSE" }, { instrument_type: "FUT" }, { lot_size: 0 }, { tick_size: undefined }, { expiry: "invalid" }]) expect(parseContract({ ...metadata, ...patch }, "NIFTY")).toBeUndefined();
  });
  it("selects an actual near-ATM contract in the nearest expiry after today", () => {
    const contract = parseContract(metadata, "NIFTY")!;
    const sameDay = { ...contract, expiry: "2026-10-23" }, farStrike = { ...contract, strike: 26000 }, laterExpiry = { ...contract, expiry: "2026-11-26" };
    expect(chooseContract([sameDay, farStrike, laterExpiry, contract], "NIFTY", "CE", 25010, now)).toEqual(contract);
    expect(() => chooseContract([farStrike], "NIFTY", "CE", 24000, now)).toThrow("near-ATM");
    expect(() => chooseContract([sameDay], "NIFTY", "CE", 25000, now)).toThrow("No verified");
  });
  it("sizes whole lots within premium/reserve limits and includes fees", () => {
    const contract = parseContract(metadata, "NIFTY")!;
    const plan = optionSize(250000, 250000, 100, contract, 10);
    expect(plan.quantity % 75).toBe(0); expect(plan.lots).toBe(3); expect(plan.cost).toBeLessThanOrEqual(25000);
    expect(() => optionSize(10000, 10000, 100, contract, 1)).toThrow("full option lot");
    expect(() => optionSize(250000, 50000, 100, contract, 1)).toThrow("reserve");
    expect(optionFill(100, 0.05, "BUY")).toBeGreaterThan(100); expect(optionFill(100, 0.05, "SELL")).toBeLessThan(100);
  });
});
