import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importBuyCsv, latestBuys, normalizeBuy } from "./buy-records";
import { holdingVerdict, sinceLastBuy } from "./holding-verdict";
const trade = { tradingsymbol: "INFY", exchange: "NSE", transaction_type: "BUY", product: "CNC", average_price: 100, quantity: 5, fill_timestamp: "2026-10-23 10:15:30", trade_id: "1" };
describe("actual recorded buys and holding verdicts", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T10:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  it("uses the actual latest execution, never order placement time or holdings average", () => {
    const first = normalizeBuy(trade, "kite-tradebook")!;
    const last = normalizeBuy({ ...trade, average_price: 110, fill_timestamp: "2026-10-24 10:15:30", trade_id: "2" }, "kite-tradebook")!;
    const result = latestBuys({}, [last, first]);
    expect(result["NSE:INFY"].price).toBe(110);
    expect(latestBuys(result, [first])["NSE:INFY"].price).toBe(110);
    expect(first.at).toBe("2026-10-23T04:45:30.000Z");
    for (const patch of [{ product: "MIS" }, { transaction_type: "SELL" }, { product: undefined }, { fill_timestamp: "2026-10-23" }, { fill_timestamp: "2027-01-01 10:00:00" }, { average_price: NaN }]) expect(normalizeBuy({ ...trade, ...patch }, "kite-tradebook")).toBeUndefined();
  });
  it("imports quoted Console CSV, and requires delivery confirmation without product tags", () => {
    const csv = '\uFEFFSymbol,Exchange,Trade Type,Quantity,Price,Trade ID,Order Execution Time,Segment\r\n"INFY",NSE,buy,5,100,1,2026-10-23 10:15:30,EQ\r\nINFY,NSE,sell,5,110,2,2026-10-23 11:00:00,EQ';
    expect(() => importBuyCsv(csv)).toThrow("delivery");
    const imported = importBuyCsv(csv, true); expect(imported.buys).toHaveLength(1); expect(imported.skipped).toBe(1);
    expect(imported.buys[0].source).toBe("console-csv");
    expect(() => importBuyCsv("symbol,price\nINFY,100", true)).toThrow("CSV needs");
  });
  it("shows per-share movement from the last fill and refuses a missing baseline", () => {
    const buy = normalizeBuy(trade, "kite-tradebook")!;
    expect(sinceLastBuy(90, buy)?.percent).toBeCloseTo(-10);
    expect(sinceLastBuy(90, buy)?.amount).toBe(-10);
    expect(sinceLastBuy(90)).toBeNull(); expect(sinceLastBuy(0, buy)).toBeNull();
    expect(holdingVerdict(90, buy).label).toBe("Review downside risk");
    expect(holdingVerdict(96, buy, -4).label).toBe("Pause additions");
    expect(holdingVerdict(120, buy).label).toBe("Review profit-taking");
    expect(holdingVerdict(106, buy).label).toBe("Hold / check exposure");
    expect(holdingVerdict(102, buy).label).toBe("Hold / monitor");
    expect(holdingVerdict(90).label).toBe("Need buy record");
  });
});
