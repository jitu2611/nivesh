import { indiaDay, type DailyClose } from "./historical-prices";
import type { PriceRow, Algorithm } from "./workspace-types";
function mean(values: number[]) { return values.reduce((s, v) => s + v, 0) / values.length; }
export function wilderRsi(closes: number[], period = 14): number[] {
  if (closes.length <= period) return [];
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const delta = closes[i] - closes[i - 1]; gain += Math.max(0, delta); loss += Math.max(0, -delta); }
  gain /= period; loss /= period;
  const value = () => gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  const values = [value()];
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(0, delta)) / period;
    loss = (loss * (period - 1) + Math.max(0, -delta)) / period;
    values.push(value());
  }
  return values;
}
export function technicalSignal(strategy: Algorithm["strategy"], candles: DailyClose[], now = new Date()): NonNullable<PriceRow["signal"]> {
  const today = indiaDay(now);
  const complete = candles.filter(c => c.day < today && Number.isFinite(c.close) && c.close > 0).sort((a, b) => a.day.localeCompare(b.day));
  const latest = complete.at(-1);
  if (!latest || now.getTime() - Date.parse(`${latest.day}T15:30:00+05:30`) > 7 * 86400000) throw new Error("Recent completed daily candles are required for this strategy.");
  const closes = complete.map(c => c.close);
  if (strategy === "sma-cross") {
    if (closes.length < 201) throw new Error("Golden cross requires 201 completed trading sessions; no signal fabricated.");
    const fast = mean(closes.slice(-50)), slow = mean(closes.slice(-200));
    const previousFast = mean(closes.slice(-51, -1)), previousSlow = mean(closes.slice(-201, -1));
    return { day: latest.day, enter: previousFast <= previousSlow && fast > slow, exit: fast < slow, reason: `SMA50 ${fast.toFixed(2)} / SMA200 ${slow.toFixed(2)}; previous ${previousFast.toFixed(2)} / ${previousSlow.toFixed(2)}. Completed session ${latest.day}.` };
  }
  if (strategy === "rsi") {
    if (closes.length < 100) throw new Error("RSI requires 100 completed sessions for warm-up; no signal fabricated.");
    const values = wilderRsi(closes);
    const rsi = values.at(-1)!, previous = values.at(-2)!;
    return { day: latest.day, enter: previous <= 30 && rsi > 30, exit: rsi >= 70, reason: `Wilder RSI(14) ${rsi.toFixed(2)}; previous ${previous.toFixed(2)}. Recovery entry >30 after ≤30; exit ≥70. Completed session ${latest.day}.` };
  }
  if (strategy === "channel-breakout") {
    if (complete.length < 21) throw new Error("Channel breakout requires 21 completed sessions.");
    const preceding = complete.slice(-21, -1);
    if (preceding.some(c => c.high == null || c.low == null || !Number.isFinite(c.high) || !Number.isFinite(c.low))) throw new Error("Channel breakout requires actual daily highs/lows; closing prices are not substituted.");
    const high = Math.max(...preceding.map(c => c.high!));
    const low = Math.min(...preceding.slice(-10).map(c => c.low!));
    return { day: latest.day, enter: latest.close > high, exit: latest.close < low, reason: `Completed close ${latest.close.toFixed(2)}; preceding 20-session high ${high.toFixed(2)}, 10-session low ${low.toFixed(2)}. Session ${latest.day}.` };
  }
  throw new Error("Not an indicator strategy.");
}
