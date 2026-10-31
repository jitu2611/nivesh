import { describe, expect, it } from "vitest";
import { healthReferenceDate, historicalBaselines } from "./historical-prices";
import { portfolioHealth } from "./portfolio-health";
import type { PriceRow } from "./workspace-types";
const now = new Date("2026-10-25T10:00:00Z");
function row(instrument: string, quantity: number, price: number, halfYear: number, year: number): PriceRow {
  return { instrument, quantity, price, average: 100, changes: { 1: null, 3: null, 7: null, 30: null }, healthBaselines: historicalBaselines([{ day: "2026-04-24", close: halfYear }, { day: "2025-10-24", close: year }], now) };
}
describe("top-level long-term portfolio health", () => {
  it("uses real calendar months/years and clamps month ends and leap dates", () => {
    expect(healthReferenceDate("6m", new Date("2026-10-31T10:00:00Z"))).toBe("2026-04-30");
    expect(healthReferenceDate("6m", new Date("2024-08-31T10:00:00Z"))).toBe("2024-02-29");
    expect(healthReferenceDate("1y", new Date("2024-02-29T10:00:00Z"))).toBe("2023-02-28");
    expect(healthReferenceDate("6m", new Date("2026-10-30T20:00:00Z"))).toBe("2026-04-30");
  });
  it("uses a prior trading close for weekends, never a later close or arbitrarily stale history", () => {
    const baselines = historicalBaselines([{ day: "2026-04-24", close: 100 }, { day: "2026-04-27", close: 999 }, { day: "2025-10-17", close: 80 }], now);
    expect(baselines["6m"]).toEqual({ targetDate: "2026-04-25", date: "2026-04-24", close: 100 });
    expect(baselines["1y"].close).toBeNull(); // Eight days stale is not a valid annual baseline.
  });
  it("calculates rupee movement and weighted percentages from today's units, excluding candidates", () => {
    const result = portfolioHealth([row("NSE:A", 1, 200, 100, 80), row("NSE:B", 2, 100, 80, 50), row("NSE:CANDIDATE", 0, 10000, 1, 1)], now);
    expect(result["6m"]).toMatchObject({ currentValue: 400, baselineValue: 260, changeAmount: 140, covered: 2, total: 2 });
    expect(result["6m"].changePercent).toBeCloseTo(140 / 260 * 100);
    expect(result["1y"]).toMatchObject({ baselineValue: 180, changeAmount: 220, covered: 2, total: 2 });
  });
  it("never reports a partial basket as the overall portfolio return", () => {
    const missing = row("NSE:NEW", 1, 100, 100, 100); delete missing.healthBaselines;
    const result = portfolioHealth([row("NSE:A", 1, 200, 100, 80), missing], now)["6m"];
    expect(result).toMatchObject({ currentValue: 300, baselineValue: null, changeAmount: null, changePercent: null, covered: 1, total: 2 });
  });
  it("handles missing quotes, empty portfolios and old saved rows without manufacturing zeros", () => {
    const missing = row("NSE:A", 1, 0, 100, 100);
    expect(portfolioHealth([missing], now)["1y"]).toMatchObject({ currentValue: null, changeAmount: null, covered: 0 });
    expect(portfolioHealth([], now)["6m"]).toMatchObject({ currentValue: null, changeAmount: null, changePercent: null, total: 0 });
    const old = row("NSE:A", 1, 100, 100, 100); delete old.healthBaselines;
    expect(portfolioHealth([old], now)["1y"].changePercent).toBeNull();
  });
});
