import type { HealthComparison, HealthPeriod, PriceRow } from "./workspace-types";
import { healthPeriods, healthReferenceDate } from "./historical-prices";
function finite(value: number) { return Number.isFinite(value) ? value : null; }
export function portfolioHealth(rows: PriceRow[], now = new Date()): Record<HealthPeriod, HealthComparison> {
  const held = rows.filter(row => row.quantity > 0); // Candidate stocks are never part of portfolio performance.
  const hasQuotes = held.length > 0 && held.every(row => Number.isFinite(row.quantity) && Number.isFinite(row.price) && row.price > 0);
  const currentValue = hasQuotes ? finite(held.reduce((sum, row) => sum + row.quantity * row.price, 0)) : null;
  return Object.fromEntries(healthPeriods.map(period => {
    const targetDate = healthReferenceDate(period, now);
    const covered = held.filter(row => {
      const baseline = row.healthBaselines?.[period];
      return Number.isFinite(row.quantity) && Number.isFinite(row.price) && row.price > 0 && baseline?.targetDate === targetDate && baseline.date !== null && baseline.close !== null && Number.isFinite(baseline.close) && baseline.close > 0;
    });
    const baselineValue = held.length > 0 && covered.length === held.length ? finite(covered.reduce((sum, row) => sum + row.quantity * row.healthBaselines![period]!.close!, 0)) : null;
    const changeAmount = currentValue !== null && baselineValue !== null ? finite(currentValue - baselineValue) : null;
    const changePercent = changeAmount !== null && baselineValue !== null && baselineValue > 0 ? finite(changeAmount / baselineValue * 100) : null;
    return [period, { targetDate, baselineValue, currentValue, changeAmount, changePercent, covered: covered.length, total: held.length }];
  })) as Record<HealthPeriod, HealthComparison>;
}
