import type { Algorithm, Period, PortfolioAnalysis, PriceRow } from "./workspace-types";
export function weightedChanges(rows: PriceRow[]): Record<Period, number | null> {
  const held = rows.filter(r => r.quantity > 0);
  return Object.fromEntries(([1, 3, 7, 30] as Period[]).map(period => {
    if (!held.length || held.some(r => !(r.price > 0) || r.changes[period] === null)) return [period, null];
    const current = held.reduce((s, r) => s + r.quantity * r.price, 0);
    const past = held.reduce((s, r) => s + r.quantity * r.price / (1 + r.changes[period]! / 100), 0);
    return [period, past > 0 ? (current / past - 1) * 100 : null];
  })) as Record<Period, number | null>;
}
export function buildSuggestions(rows: PriceRow[], cash: number): PortfolioAnalysis["suggestions"] {
  if (!rows.length || rows.some(r => !(r.price > 0) || r.error)) return [];
  const equity = rows.reduce((s, r) => s + r.quantity * r.price, 0);
  const target = (equity + Math.max(0, cash) * 0.8) / rows.length;
  let remaining = Math.max(0, cash) * 0.8;
  return rows.map(r => {
    const delta = target - r.quantity * r.price;
    if (delta < -r.price) {
      const quantity = Math.min(r.quantity, Math.floor(-delta / r.price));
      return { instrument: r.instrument, action: "REDUCE", quantity, amount: quantity * r.price, reason: "Above illustrative equal-weight target. Review taxes and conviction before reducing; existing holdings are protected." };
    }
    const quantity = Math.floor(Math.min(Math.max(0, delta), remaining) / (r.price * 1.002));
    remaining -= quantity * r.price * 1.002;
    return { instrument: r.instrument, action: quantity ? "ADD" : "HOLD", quantity, amount: quantity * r.price, reason: quantity ? "Below illustrative equal-weight target; sized from available cash only, not assumed sale proceeds. Review business fundamentals first." : "Within one share of target, or insufficient unreserved cash." };
  });
}
export function analysisSymbols(value: unknown): string[] {
  const symbols = [...new Set(String(value ?? "").toUpperCase().split(/[\s,]+/).filter(Boolean).map(s => s.includes(":") ? s : `NSE:${s}`))];
  if (symbols.length > 20 || symbols.some(s => !/^(NSE|BSE):[A-Z0-9&_.-]{1,30}$/.test(s))) throw new Error("Use up to 20 NSE/BSE equity symbols for portfolio research.");
  return symbols;
}
export function parseAlgorithm(input: Record<string, unknown>): Omit<Algorithm, "id" | "cash" | "positions" | "realisedPnl" | "enabled"> {
  const name = String(input.name ?? "").trim();
  if (!name || name.length > 80) throw new Error("Provide a name of 1–80 characters.");
  if (input.market !== "index-options" || !["NIFTY", "BANKNIFTY"].includes(String(input.index))) throw new Error("Choose NIFTY or BANKNIFTY index options in paper mode.");
  if (input.scope === "portfolio" || String(input.symbols || "").trim()) throw new Error("Algorithms trade index options only, not portfolio stocks.");
  if (!["orb", "ema-crossover", "rsi-momentum"].includes(String(input.strategy))) throw new Error("Choose an index-option strategy.");
  const budget = Number(input.budget), stopPercent = Number(input.stopPercent), targetPercent = Number(input.targetPercent);
  const maxLots = Number(input.maxLots ?? 1), maxTradesPerDay = Number(input.maxTradesPerDay ?? 3);
  if (![budget, stopPercent, targetPercent, maxLots, maxTradesPerDay].every(Number.isFinite) || budget < 10000 || budget > 10000000 || stopPercent < 0.5 || stopPercent > 50 || targetPercent < 0.5 || targetPercent > 200 || !Number.isInteger(maxLots) || maxLots < 1 || maxLots > 10 || !Number.isInteger(maxTradesPerDay) || maxTradesPerDay < 1 || maxTradesPerDay > 10) throw new Error("Check paper budget (₹10k–1cr), premium stop (0.5–50%), target (0.5–200%), max lots and daily entries (1–10).");
  return { name, symbols: [], scope: "symbols", strategy: input.strategy as Algorithm["strategy"], lookback: 7, threshold: 3, market: "index-options", index: input.index as "NIFTY" | "BANKNIFTY", maxLots, maxTradesPerDay, budget, stopPercent, targetPercent };
}
export function entrySignal(strategy: Algorithm["strategy"], change: number | null, threshold: number) {
  if (strategy !== "dip" && strategy !== "momentum") return false;
  return change !== null && Number.isFinite(change) && (strategy === "dip" ? change <= -threshold : change >= threshold);
}
