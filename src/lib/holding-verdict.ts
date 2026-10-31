import type { LastBuy } from "./workspace-types";
export function sinceLastBuy(price: number, buy?: LastBuy) {
  if (!buy || !Number.isFinite(price) || price <= 0 || !Number.isFinite(buy.price) || buy.price <= 0) return null;
  return { amount: price - buy.price, percent: (price - buy.price) / buy.price * 100 };
}
export function holdingVerdict(price: number, buy?: LastBuy, day?: number | null, week?: number | null) {
  const change = sinceLastBuy(price, buy);
  if (!change) return { label: "Need buy record", tone: "neutral", reason: "Sync today's tradebook or import historical fills. Average purchase cost is not used as the latest buy." };
  if (change.percent <= -10) return { label: "Review downside risk", tone: "down", reason: "Down 10% or more from the last recorded BUY fill. Recheck the investment thesis and your loss limit; consider reducing only if either is breached. Do not average down solely because the price fell." };
  if (change.percent <= -5 || (day != null && day <= -3) || (week != null && week <= -7)) return { label: "Pause additions", tone: "down", reason: "Down at least 5% since the last recorded buy, 3% in a day, or 7% in a week. Check news, earnings and portfolio exposure before adding; a falling price alone is not a buy signal." };
  if (change.percent >= 15) return { label: "Review profit-taking", tone: "up", reason: "Up 15% or more from the last recorded buy. Review your target and portfolio weight; consider trimming only if overweight or the investment thesis has changed." };
  if (change.percent >= 5) return { label: "Hold / check exposure", tone: "up", reason: "Up at least 5% since the last recorded buy. Monitor concentration and your exit plan; avoid chasing the rise without fresh research." };
  return { label: "Hold / monitor", tone: "neutral", reason: "Within −5% to +5% of the last recorded buy with no available daily/weekly downside trigger. Monitor the thesis; missing historical data is not evidence of stability." };
}
