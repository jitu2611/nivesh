import { indiaDay } from "./historical-prices";
import { wilderRsi } from "./technical-strategies";
export type IndexName = "NIFTY" | "BANKNIFTY";
export type IndexStrategy = "orb" | "ema-crossover" | "rsi-momentum";
export type IndexBar = { at: number; open: number; high: number; low: number; close: number };
export type IndexSignal = { id: string; at: number; direction: "CE" | "PE" | null; exitCall: boolean; exitPut: boolean; reason: string };
export type OptionContract = { instrument: string; index: IndexName; type: "CE" | "PE"; expiry: string; strike: number; lotSize: number; tickSize: number };
export function kiteTime(value: unknown) {
  if (typeof value !== "string") return NaN;
  return Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}+05:30`);
}
export function parseIndexBars(value: unknown): IndexBar[] {
  let data = value;
  for (let i = 0; i < 8 && data && typeof data === "object" && !Array.isArray(data); i++) {
    const r = data as Record<string, unknown>;
    if (r.candles !== undefined) { data = r.candles; break; }
    if (r.data !== undefined) data = r.data; else if (r.result !== undefined) data = r.result; else break;
  }
  if (!Array.isArray(data)) throw new Error("Index candle response is unsupported.");
  const bars = new Map<number, IndexBar>();
  for (const row of data) {
    const r = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const a = Array.isArray(row) ? row : [r.date ?? r.timestamp, r.open, r.high, r.low, r.close];
    const [open, high, low, close] = a.slice(1, 5).map(Number);
    const at = kiteTime(a[0]);
    if (Number.isFinite(at) && [open, high, low, close].every(n => Number.isFinite(n) && n > 0) && high >= Math.max(open, close, low) && low <= Math.min(open, close)) bars.set(at, { at, open, high, low, close });
  }
  return [...bars.values()].sort((a, b) => a.at - b.at);
}
function ema(values: number[], period: number) {
  if (values.length < period) return [];
  let average = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = [average];
  for (const value of values.slice(period)) { average += (value - average) * 2 / (period + 1); result.push(average); }
  return result;
}
export function indexSignal(strategy: IndexStrategy, bars: IndexBar[], now = new Date()): IndexSignal {
  const today = indiaDay(now), interval = 5 * 60000;
  const complete = bars.filter(b => b.at + interval <= now.getTime());
  const latest = complete.at(-1), previous = complete.at(-2);
  if (!latest || !previous || indiaDay(new Date(latest.at)) !== today || latest.at + interval < now.getTime() - interval || latest.at - previous.at !== interval) throw new Error("Fresh consecutive completed 5-minute index candles are required.");
  const result: IndexSignal = { id: `${strategy}:${latest.at}`, at: latest.at + interval, direction: null, exitCall: false, exitPut: false, reason: "No entry signal." };
  if (strategy === "orb") {
    const start = Date.parse(`${today}T09:15:00+05:30`);
    const range = complete.filter(b => b.at >= start && b.at < start + 15 * 60000);
    if (range.length !== 3 || range.some((b, i) => b.at !== start + i * interval) || latest.at < start + 15 * 60000) throw new Error("Opening range requires all three 09:15–09:30 candles and a later completed breakout candle.");
    const high = Math.max(...range.map(b => b.high)), low = Math.min(...range.map(b => b.low));
    result.direction = previous.close <= high && latest.close > high ? "CE" : previous.close >= low && latest.close < low ? "PE" : null;
    result.exitCall = latest.close < high; result.exitPut = latest.close > low;
    result.reason = `15-minute ORB: index close ${latest.close}; range ${low}–${high}. Breakout buys CE; breakdown buys PE.`;
  } else {
    if (complete.length < 100) throw new Error("EMA/RSI presets need 100 completed five-minute index bars for warm-up.");
    const closes = complete.map(b => b.close);
    if (strategy === "ema-crossover") {
      const fast = ema(closes, 20), slow = ema(closes, 50);
      const f = fast.at(-1)!, s = slow.at(-1)!, pf = fast.at(-2)!, ps = slow.at(-2)!;
      result.direction = pf <= ps && f > s ? "CE" : pf >= ps && f < s ? "PE" : null;
      result.exitCall = f < s; result.exitPut = f > s;
      result.reason = `Index EMA20 ${f.toFixed(2)} / EMA50 ${s.toFixed(2)}; prior ${pf.toFixed(2)} / ${ps.toFixed(2)}. Cross up buys CE; cross down buys PE.`;
    } else if (strategy === "rsi-momentum") {
      const values = wilderRsi(closes), rsi = values.at(-1)!, prev = values.at(-2)!;
      result.direction = prev <= 55 && rsi > 55 ? "CE" : prev >= 45 && rsi < 45 ? "PE" : null;
      result.exitCall = rsi < 50; result.exitPut = rsi > 50;
      result.reason = `Index Wilder RSI(14) ${rsi.toFixed(2)}; prior ${prev.toFixed(2)}. Cross >55 buys CE; cross <45 buys PE; neutral 50 exits.`;
    } else throw new Error("Unsupported index-option strategy.");
  }
  return result;
}
export function parseContract(value: unknown, index: IndexName): OptionContract | undefined {
  if (!value || typeof value !== "object") return;
  const r = value as Record<string, unknown>;
  const symbol = String(r.tradingsymbol || ""), identity = String(r.name ?? r.underlying ?? r.underlying_symbol ?? "").toUpperCase();
  const type = String(r.instrument_type || "").toUpperCase();
  const expiry = String(r.expiry || "").slice(0, 10), strike = Number(r.strike), lotSize = Number(r.lot_size), tickSize = Number(r.tick_size);
  if (identity !== index || r.exchange !== "NFO" || !String(r.segment).includes("OPT") || !["CE", "PE"].includes(type) || !symbol.startsWith(index) || !symbol.endsWith(type) || !/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !Number.isFinite(Date.parse(expiry)) || !Number.isFinite(strike) || strike <= 0 || !Number.isInteger(lotSize) || lotSize < 1 || !Number.isFinite(tickSize) || tickSize <= 0) return;
  return { instrument: `NFO:${symbol}`, index, type: type as "CE" | "PE", expiry, strike, lotSize, tickSize };
}
export function chooseContract(contracts: OptionContract[], index: IndexName, side: "CE" | "PE", spot: number, now = new Date()) {
  const today = indiaDay(now);
  const valid = contracts.filter(c => c.index === index && c.type === side && c.expiry > today);
  const expiry = valid.map(c => c.expiry).sort()[0];
  const nearest = valid.filter(c => c.expiry === expiry).sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot) || a.strike - b.strike);
  if (!Number.isFinite(spot) || spot <= 0 || !nearest.length) throw new Error("No verified, non-expiring-today ATM contract is available.");
  // Do not turn an incomplete far-away chain into an alleged ATM trade.
  if (Math.abs(nearest[0].strike - spot) / spot > 0.01) throw new Error("The available chain does not contain a near-ATM strike; entry skipped.");
  return nearest[0];
}
export function optionCharges(gross: number) { return 20 + gross * 0.00055; }
export function optionFill(price: number, tick: number, side: "BUY" | "SELL") {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(tick) || tick <= 0) throw new Error("Premium and tick size must be positive finite values.");
  const adjusted = price * (side === "BUY" ? 1.0015 : 0.9985);
  const fill = (side === "BUY" ? Math.ceil(adjusted / tick) : Math.floor(adjusted / tick)) * tick;
  if (!Number.isFinite(fill) || fill <= 0) throw new Error("Invalid simulated premium fill.");
  return Number(fill.toFixed(8));
}
export function optionSize(budget: number, cash: number, premium: number, contract: OptionContract, maxLots: number) {
  if (![budget, cash, premium, maxLots].every(Number.isFinite) || budget <= 0 || cash < 0 || premium <= 0 || !Number.isInteger(maxLots) || maxLots < 1 || !Number.isInteger(contract.lotSize) || contract.lotSize < 1) throw new Error("Invalid option-sizing inputs.");
  const permitted = Math.min(budget * 0.10, budget * 0.35, Math.max(0, cash - budget * 0.20));
  const perLot = premium * contract.lotSize;
  const lots = Math.min(maxLots, Math.floor(Math.max(0, permitted - 20) / (perLot * 1.00055)));
  if (lots < 1) throw new Error("One full option lot cannot fit the 10% premium-at-risk cap and 20% cash reserve; no fractional lot or risk-limit override.");
  const quantity = lots * contract.lotSize, gross = premium * quantity, charges = optionCharges(gross);
  if (gross + charges > permitted || gross + charges > cash) throw new Error("Estimated premium/charges exceed paper risk limits.");
  return { lots, quantity, charges, cost: gross + charges };
}
