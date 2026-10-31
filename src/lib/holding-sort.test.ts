import { describe, expect, it } from "vitest";
import { nextHoldingSort, sortHoldingRows, type HoldingSortKey, type SortableHolding } from "./holding-sort";
function row(symbol: string, price: number, quantity: number, buyPrice?: number): SortableHolding {
  return { holding: { symbol, company: symbol, exchange: "NSE", quantity, ltp: price, average: 100, managed: false }, verdict: { label: "Hold / monitor" }, buy: buyPrice === undefined ? undefined : { instrument: `NSE:${symbol}`, price: buyPrice, quantity: 2, at: "2026-10-23T04:00:00Z", tradeId: "1", source: "kite-tradebook" } };
}
const names = (rows: SortableHolding[], key: HoldingSortKey, direction: "asc" | "desc" = "asc") => sortHoldingRows(rows, { key, direction }).map(row => row.holding.symbol);
describe("portfolio sorting", () => {
  it("sorts numeric prices, values, quantities and P&L rather than formatted strings", () => {
    const rows = [row("B", 1000, 1), row("A", 90, 20), row("C", 100, 10)];
    expect(names(rows, "price")).toEqual(["A", "C", "B"]);
    expect(names(rows, "quantity", "desc")).toEqual(["A", "C", "B"]);
    expect(names(rows, "value", "desc")).toEqual(["A", "B", "C"]);
    expect(names(rows, "pnl")).toEqual(["A", "C", "B"]);
  });
  it("sorts every last-buy dimension and keeps missing buy records last in either direction", () => {
    const a = row("A", 80, 10, 100), b = row("B", 120, 10, 110), missing = row("M", 50, 10);
    b.buy!.quantity = 5; b.buy!.at = "2026-10-24T04:00:00Z";
    const rows = [missing, b, a];
    for (const key of ["buy-date", "buy-price", "buy-quantity", "buy-value", "buy-change"] as const) {
      expect(names(rows, key)).toEqual(["A", "B", "M"]);
      expect(names(rows, key, "desc")).toEqual(["B", "A", "M"]);
    }
  });
  it("sorts percentage changes numerically with zero as valid and unknown values last", () => {
    const a = row("A", 100, 1), b = row("B", 100, 1), c = row("C", 100, 1), d = row("D", 100, 1);
    a.changes = { 1: -12, 7: NaN }; b.changes = { 1: 0, 7: 0 }; c.changes = { 1: 2 }; d.changes = { 1: null };
    expect(names([d, c, b, a], "1d")).toEqual(["A", "B", "C", "D"]);
    expect(names([d, c, b, a], "1d", "desc")).toEqual(["C", "B", "A", "D"]);
    expect(names([a, b], "7d")).toEqual(["B", "A"]);
  });
  it("sorts verdicts by review priority, not alphabetical or profitability claims", () => {
    const a = row("A", 100, 1), b = row("B", 100, 1), c = row("C", 100, 1);
    a.verdict.label = "Hold / monitor"; b.verdict.label = "Pause additions"; c.verdict.label = "Review downside risk";
    expect(names([a, b, c], "verdict")).toEqual(["C", "B", "A"]);
  });
  it("does not mutate broker order and resolves ties deterministically", () => {
    const rows = [row("B", 100, 1), row("A", 100, 1)]; const before = [...rows];
    expect(names(rows, "price", "desc")).toEqual(["A", "B"]); expect(rows).toEqual(before);
    expect(names([row("STOCK10", 100, 1), row("STOCK2", 100, 1)], "stock")).toEqual(["STOCK2", "STOCK10"]);
  });
  it("toggles an active column and uses useful defaults for a newly selected column", () => {
    expect(nextHoldingSort({ key: "stock", direction: "asc" }, "stock")).toEqual({ key: "stock", direction: "desc" });
    expect(nextHoldingSort({ key: "stock", direction: "desc" }, "value")).toEqual({ key: "value", direction: "desc" });
    expect(nextHoldingSort({ key: "value", direction: "desc" }, "1d")).toEqual({ key: "1d", direction: "asc" });
  });
});
