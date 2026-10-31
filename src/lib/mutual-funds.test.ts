import { describe, expect, it } from "vitest";
import { normalizeMutualFunds, sortMutualFunds } from "./mutual-funds";
const first = { fund: "Example Equity Direct Growth", tradingsymbol: "TEST-EQ", folio: "TEST1001", quantity: 10.125, average_price: 50, last_price: 60, last_price_date: "2026-10-23", pledged_quantity: 1.125, pnl: 0 };
describe("mutual-fund holding normalization", () => {
  it("preserves fractional units, actual NAV precision, folio and reported fields", () => {
    const snapshot = normalizeMutualFunds({ data: { holdings: [first] } }, "2026-10-25T10:00:00Z");
    const h = snapshot.holdings[0];
    expect(h.units).toBe(10.125); expect(h.averageNav).toBe(50); expect(h.nav).toBe(60);
    expect(h.invested).toBe(506.25); expect(h.value).toBe(607.5); expect(h.pnl).toBe(101.25); expect(h.returnPercent).toBe(20);
    expect(h.reportedPnl).toBe(0); expect(h.availableUnits).toBe(9); expect(h.folio).toBe("TEST1001"); expect(h.navDate).toBe("2026-10-23");
    expect(snapshot.asOf).toBe("2026-10-25T10:00:00Z");
  });
  it("calculates weighted absolute totals instead of averaging fund percentages", () => {
    const snapshot = normalizeMutualFunds([first, { ...first, fund: "Example Debt", tradingsymbol: "TEST-DEBT", quantity: 2.5, average_price: 100, last_price: 80 }]);
    expect(snapshot.invested).toBe(756.25); expect(snapshot.value).toBe(807.5); expect(snapshot.pnl).toBe(51.25);
    expect(snapshot.returnPercent).toBeCloseTo(51.25 / 756.25 * 100);
  });
  it("keeps multiple folios separate and supports common result wrappers", () => {
    const snapshot = normalizeMutualFunds({ result: { data: { mf_holdings: [first, { ...first, folio: "TEST1002" }] } } });
    expect(snapshot.holdings).toHaveLength(2); expect(new Set(snapshot.holdings.map(h => h.id)).size).toBe(2);
  });
  it("does not invent zero NAVs, pledge balances or complete totals from incomplete records", () => {
    const snapshot = normalizeMutualFunds([{ ...first, last_price: undefined, pledged_quantity: undefined }]);
    expect(snapshot.holdings[0].nav).toBeNull(); expect(snapshot.holdings[0].value).toBeNull(); expect(snapshot.holdings[0].pledgedUnits).toBeNull();
    expect(snapshot.holdings[0].availableUnits).toBeNull(); expect(snapshot.invested).toBe(506.25); expect(snapshot.value).toBeNull(); expect(snapshot.pnl).toBeNull();
    expect(snapshot.returnPercent).toBeNull();
  });
  it("handles empty portfolios and zero units without dividing by zero", () => {
    expect(normalizeMutualFunds([])).toMatchObject({ holdings: [], invested: 0, value: 0, pnl: 0, returnPercent: null });
    const zero = normalizeMutualFunds([{ ...first, quantity: 0, last_price: undefined, average_price: undefined }]);
    expect(zero).toMatchObject({ invested: 0, value: 0, pnl: 0, returnPercent: null });
  });
  it("rejects malformed payloads and handles invalid numeric fields as unavailable", () => {
    for (const payload of [{ error: "failed" }, [null], [{}]]) expect(() => normalizeMutualFunds(payload)).toThrow();
    const h = normalizeMutualFunds([{ ...first, quantity: NaN, average_price: Infinity, last_price: 0 }]).holdings[0];
    expect(h.units).toBeNull(); expect(h.averageNav).toBeNull(); expect(h.nav).toBeNull();
    expect(normalizeMutualFunds([{ ...first, pledged_quantity: 999 }]).holdings[0].availableUnits).toBeNull();
  });
  it("sorts numeric values and NAV dates with missing data last in both directions", () => {
    const rows = normalizeMutualFunds([
      { ...first, fund: "B", quantity: 100, last_price_date: "2026-10-22" },
      { ...first, fund: "A", quantity: 2, last_price_date: "2026-10-23" },
      { ...first, fund: "Missing", quantity: null, last_price_date: null },
    ]).holdings;
    expect(sortMutualFunds(rows, { key: "value", direction: "asc" }).map(h => h.fund)).toEqual(["A", "B", "Missing"]);
    expect(sortMutualFunds(rows, { key: "value", direction: "desc" }).map(h => h.fund)).toEqual(["B", "A", "Missing"]);
    expect(sortMutualFunds(rows, { key: "navDate", direction: "desc" }).map(h => h.fund)).toEqual(["A", "B", "Missing"]);
    expect(rows.map(h => h.fund)).toEqual(["B", "A", "Missing"]);
  });
});
