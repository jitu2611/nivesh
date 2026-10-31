import "server-only";
import { kiteMcp, resultData, resultText } from "./kite-mcp";
import type { LivePortfolio } from "./types";
import type { Algorithm, PortfolioAnalysis, PriceRow } from "./workspace-types";
import { isIndicatorStrategy } from "./algorithm-catalog";
import { technicalSignal } from "./technical-strategies";
import { portfolioHealth } from "./portfolio-health";
import { buildSuggestions, weightedChanges } from "./workspace-policy";
import { historicalBaselines, historicalChanges, indiaDay, marketDataError, normalizeDailyCloses, type DailyClose } from "./historical-prices";
export { periods } from "./historical-prices";
const globalHistory = globalThis as typeof globalThis & { niveshDailyCloses?: Map<number, { at: number; day: string; days: number; closes: DailyClose[] }> };
const historyCache = globalHistory.niveshDailyCloses ??= new Map();
function unwrap(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const r = value as Record<string, unknown>;
    if (r.data !== undefined) return unwrap(r.data);
    if (r.result !== undefined) return unwrap(r.result);
  }
  return value;
}
async function call(tool: string, args: Record<string, unknown>) {
  const result = await kiteMcp.callReadOnly(tool, args);
  if (result.isError) throw new Error(resultText(result) || "Market data unavailable.");
  return unwrap(resultData(result));
}
export async function priceHistory(instrument: string, quantity = 0, average = 0, strategy?: Algorithm["strategy"]): Promise<PriceRow> {
  const row: PriceRow = { instrument, quantity, average, price: 0, changes: { 1: null, 3: null, 7: null, 30: null } };
  try {
    const quotes = await call("get_quotes", { instruments: [instrument] }) as Record<string, { instrument_token: number; last_price: number; timestamp?: string; last_trade_time?: string }>;
    const quote = quotes?.[instrument];
    if (!quote || !Number.isFinite(quote.last_price) || !(quote.last_price > 0) || !quote.instrument_token) throw new Error("Quote unavailable.");
    row.price = quote.last_price;
    const now = new Date();
    const historyDays = 450; // Covers one calendar year plus prior-session/holiday buffer.
    let cached = historyCache.get(quote.instrument_token);
    if (!cached || (cached.days || 0) < historyDays || cached.day !== indiaDay(now) || now.getTime() - cached.at > 15 * 60000) {
      const history = await call("get_historical_data", {
        instrument_token: quote.instrument_token, interval: "day",
        from_date: indiaDay(new Date(now.getTime() - historyDays * 86400000)) + " 00:00:00",
        to_date: indiaDay(now) + " 23:59:59", continuous: false,
      });
      cached = { at: now.getTime(), day: indiaDay(now), days: historyDays, closes: normalizeDailyCloses(history) };
      if (historyCache.size >= 200) historyCache.delete(historyCache.keys().next().value!);
      historyCache.set(quote.instrument_token, cached);
    }
    row.healthBaselines = historicalBaselines(cached.closes, now);
    row.changes = historicalChanges(row.price, cached.closes, now);
    if (strategy && isIndicatorStrategy(strategy)) row.signal = technicalSignal(strategy, cached.closes, now);
    if (Object.values(row.healthBaselines).every(baseline => baseline.close === null)) throw new Error("No historical closes cover the selected lookback dates.");
  } catch (error) { row.error = marketDataError(error); }
  return row;
}
export async function analysePortfolio(portfolio: LivePortfolio, extraSymbols: string[] = []): Promise<PortfolioAnalysis> {
  const items = portfolio.holdings.filter(h => h.quantity > 0).map(h => ({ instrument: `${h.exchange || "NSE"}:${h.symbol}`, quantity: h.quantity, average: h.average }));
  for (const instrument of extraSymbols) if (!items.some(h => h.instrument === instrument)) items.push({ instrument, quantity: 0, average: 0 });
  if (items.length > 50) throw new Error("Analyse at most 50 instruments at a time.");
  const rows: PriceRow[] = [];
  // Pace requests and stop on gateway/session failures instead of repeatedly
  // hitting an upstream block for every remaining holding.
  let blocked: string | undefined;
  for (const item of items) {
    if (blocked) {
      rows.push({ ...item, price: 0, changes: { 1: null, 3: null, 7: null, 30: null }, error: blocked });
      continue;
    }
    if (rows.length) await new Promise(resolve => setTimeout(resolve, 1000));
    const row = await priceHistory(item.instrument, item.quantity, item.average);
    rows.push(row);
    if (row.error && /upstream security gateway|authorization is required/i.test(row.error)) blocked = row.error;
  }
  const asOf = new Date();
  return {
    asOf: asOf.toISOString(), rows, changes: weightedChanges(rows), health: portfolioHealth(rows, asOf),
    suggestions: buildSuggestions(rows, portfolio.availableCash),
    methodology: "Short periods use calendar days; 6M and 1Y use calendar months/years with month-end clamping. Baselines use the last available close on/before each date, at most seven days earlier. Equity comparisons hold today's quantities constant: price-only movement in ₹ and %, not actual account profit, annualised returns, XIRR or peak-to-trough drawdown. Mutual funds, cash, dividends, fees, realised trades and paper algorithms are excluded. Actual account profit needs transaction/cash-flow history; review corporate actions when interpreting long lookbacks. Missing history stays unavailable; partial coverage is never shown as a complete portfolio return. Suggestions are equal-weight rebalancing illustrations with a 20% cash reserve, not fundamental buy/sell advice. Candidate additions require manual review. No brokerage orders are created.",
  };
}
