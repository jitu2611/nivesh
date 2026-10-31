import type { HealthBaseline, HealthPeriod, Period } from "./workspace-types";
export const periods: Period[] = [1, 3, 7, 30];
export const healthPeriods: HealthPeriod[] = [...periods, "6m", "1y"];
export function healthPeriodLabel(period: HealthPeriod) { return typeof period === "number" ? `${period}d` : period === "6m" ? "6M" : "1Y"; }
export function healthPeriodDescription(period: HealthPeriod) { return typeof period === "number" ? `${period}-day` : period === "6m" ? "6-month" : "1-year"; }
export type DailyClose = { day: string; close: number; high?: number; low?: number };
export function indiaDay(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function candleDay(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? indiaDay(value) : undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? indiaDay(date) : undefined;
  }
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(value);
  if (!match) return undefined;
  const date = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) return undefined;
  if (value.length > 10 && /Z$|[+-]\d\d:?\d\d$/.test(value)) {
    const instant = new Date(value);
    return Number.isFinite(instant.getTime()) ? indiaDay(instant) : undefined;
  }
  return match[1];
}
export function normalizeDailyCloses(payload: unknown): DailyClose[] {
  let value = payload;
  for (let i = 0; i < 8 && value && typeof value === "object" && !Array.isArray(value); i++) {
    const record = value as Record<string, unknown>;
    if (record.candles !== undefined) { value = record.candles; break; }
    if (record.data !== undefined) value = record.data;
    else if (record.result !== undefined) value = record.result;
    else break;
  }
  if (!Array.isArray(value)) throw new Error("Kite returned an unsupported historical-data format.");
  const byDay = new Map<string, DailyClose>();
  for (const candle of value) {
    let date: unknown, rawClose: unknown, rawHigh: unknown, rawLow: unknown;
    if (Array.isArray(candle)) { date = candle[0]; rawClose = candle[4]; rawHigh = candle[2]; rawLow = candle[3]; }
    else if (candle && typeof candle === "object") {
      const record = candle as Record<string, unknown>;
      date = record.date ?? record.timestamp ?? record.time;
      rawClose = record.close; rawHigh = record.high; rawLow = record.low;
    }
    const day = candleDay(date);
    const close = typeof rawClose === "number" ? rawClose : typeof rawClose === "string" && rawClose.trim() ? Number(rawClose) : NaN;
    if (day && Number.isFinite(close) && close > 0) {
      const high = Number(rawHigh), low = Number(rawLow);
      const range = Number.isFinite(high) && Number.isFinite(low) && low > 0 && high >= close && low <= close ? { high, low } : {};
      byDay.set(day, { day, close, ...range });
    }
  }
  if (!byDay.size) throw new Error("Kite returned no usable dated historical closes.");
  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}
export function healthReferenceDate(period: HealthPeriod, now = new Date()): string {
  const today = indiaDay(now);
  if (typeof period === "number") {
    const date = new Date(`${today}T12:00:00+05:30`);
    date.setUTCDate(date.getUTCDate() - period);
    return indiaDay(date);
  }
  const [year, month, day] = today.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - (period === "6m" ? 6 : 12), 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
export function historicalBaselines(closes: DailyClose[], now = new Date()): Record<HealthPeriod, HealthBaseline> {
  const ordered = [...closes].filter(c => Number.isFinite(c.close) && c.close > 0).sort((a, b) => a.day.localeCompare(b.day));
  return Object.fromEntries(healthPeriods.map(period => {
    const targetDate = healthReferenceDate(period, now);
    const candidate = ordered.filter(c => c.day <= targetDate).at(-1);
    // Weekends/normal holidays use a preceding close, not an arbitrarily stale
    // price from a suspended security or an incomplete response.
    const gap = candidate ? Date.parse(targetDate) - Date.parse(candidate.day) : NaN;
    const valid = candidate && gap >= 0 && gap <= 7 * 86400000;
    return [period, { targetDate, date: valid ? candidate.day : null, close: valid ? candidate.close : null }];
  })) as Record<HealthPeriod, HealthBaseline>;
}
export function historicalChanges(price: number, closes: DailyClose[], now = new Date()): Record<Period, number | null> {
  const baselines = historicalBaselines(closes, now);
  return Object.fromEntries(periods.map(period => {
    const close = baselines[period].close;
    return [period, close !== null && Number.isFinite(price) && price > 0 ? (price / close - 1) * 100 : null];
  })) as Record<Period, number | null>;
}
export function marketDataError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  if (/cloudflare|challenges\.cloudflare|just a moment|<!doctype|<html/i.test(text)) return "Kite MCP is temporarily blocked by its upstream security gateway. Retry later; repeated requests will not resolve the challenge.";
  if (/log in|login|authoriz|session.*expir/i.test(text)) return "Kite authorization is required or expired. Reconnect Kite and retry.";
  return text.replace(/https?:\/\/\S+/g, "[provider URL]").slice(0, 240) || "Kite market data is unavailable.";
}
