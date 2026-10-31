import "server-only";
import { kiteMcp, resultData, resultText } from "./kite-mcp";
import { indiaDay, marketDataError } from "./historical-prices";
import { chooseContract, kiteTime, parseContract, parseIndexBars, type IndexBar, type IndexName, type OptionContract } from "./index-options-policy";
const globals = globalThis as typeof globalThis & {
  indexChains?: Map<IndexName, { at: number; day: string; contracts: OptionContract[] }>;
  indexBars?: Map<IndexName, { at: number; bars: IndexBar[] }>;
};
function record(v: unknown): Record<string, unknown> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; }
function unwrap(v: unknown): unknown {
  for (let i = 0; i < 8; i++) { const r = record(v); if (r.data !== undefined) v = r.data; else if (r.result !== undefined) v = r.result; else break; }
  return v;
}
async function call(tool: string, args: Record<string, unknown> = {}) {
  const result = await kiteMcp.callReadOnly(tool, args);
  if (result.isError) throw new Error(marketDataError(new Error(resultText(result))));
  return resultData(result);
}
function assertFresh(timestamp: unknown) {
  const age = Date.now() - kiteTime(timestamp);
  if (!Number.isFinite(age) || age < -60000 || age > 120000) throw new Error("A quote no older than two minutes is required; no simulated fill.");
}
export async function underlyingQuote(index: IndexName) {
  const instrument = index === "NIFTY" ? "NSE:NIFTY 50" : "NSE:NIFTY BANK";
  const r = record(record(unwrap(await call("get_quotes", { instruments: [instrument] })))[instrument]);
  assertFresh(r.timestamp); // Indices have no executable last_trade_time.
  const price = Number(r.last_price), token = Number(r.instrument_token);
  if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(token) || token < 1) throw new Error("Index spot/token unavailable.");
  return { price, token };
}
export async function loadIndexBars(index: IndexName) {
  const cache = globals.indexBars ??= new Map();
  const prior = cache.get(index);
  if (prior && Date.now() - prior.at < 20000) return prior.bars;
  const quote = await underlyingQuote(index), now = new Date();
  const bars = parseIndexBars(await call("get_historical_data", {
    instrument_token: quote.token, interval: "5minute", continuous: false,
    from_date: `${indiaDay(new Date(now.getTime() - 10 * 86400000))} 00:00:00`,
    to_date: `${indiaDay(now)} 23:59:59`,
  }));
  cache.set(index, { at: Date.now(), bars });
  return bars;
}
function instrumentPage(payload: unknown) {
  let data = payload, metadata: Record<string, unknown> = {};
  for (let i = 0; i < 8 && !Array.isArray(data); i++) {
    const r = record(data);
    metadata = { ...metadata, ...r, ...record(r.pagination) };
    if (Array.isArray(r.instruments)) { data = r.instruments; break; }
    if (Array.isArray(r.results)) { data = r.results; break; }
    if (r.data !== undefined) data = r.data; else if (r.result !== undefined) data = r.result; else break;
  }
  if (!Array.isArray(data)) throw new Error("Instrument master response is unsupported; contract selection skipped.");
  return { rows: data, metadata };
}
async function contracts(index: IndexName) {
  const cache = globals.indexChains ??= new Map(), today = indiaDay(new Date());
  const cached = cache.get(index);
  if (cached && cached.day === today && Date.now() - cached.at < 3600000) return cached.contracts;
  const output: OptionContract[] = [], seen = new Set<string>(), limit = 500;
  let count = 0, from = 0;
  for (let page = 0; page < 20; page++) {
    const result = await call("search_instruments", { query: `NFO:${index}`, filter_on: "underlying", from, limit });
    const { rows, metadata } = instrumentPage(result);
    let newRows = 0;
    for (const r of rows) {
      const item = record(r), id = String(item.instrument_token ?? `${item.exchange}:${item.tradingsymbol}`);
      if (seen.has(id)) continue;
      seen.add(id); newRows++;
      const contract = parseContract(item, index); if (contract) output.push(contract);
    }
    if (rows.length && !newRows) throw new Error("Instrument pagination repeated a page; refusing to select from an incomplete chain.");
    count += rows.length;
    const total = Number(metadata.total ?? metadata.total_count ?? metadata.total_results);
    if (!rows.length && (metadata.has_more === true || (Number.isFinite(total) && count < total))) throw new Error("Instrument master ended before its advertised total; no partial-chain trade.");
    const complete = rows.length === 0 || (Number.isFinite(total) && total >= 0 && count >= total) || (metadata.has_more === false && !(Number.isFinite(total) && count < total)) || (rows.length < limit && metadata.has_more !== true && !(Number.isFinite(total) && count < total));
    if (complete) { cache.set(index, { at: Date.now(), day: today, contracts: output }); return output; }
    const next = Number(metadata.next_from);
    from = Number.isInteger(next) && next > from ? next : from + rows.length;
  }
  throw new Error("Instrument chain exceeded the bounded pagination limit; no partial-chain trade.");
}
export async function resolveOption(index: IndexName, side: "CE" | "PE") {
  const chain = await contracts(index);
  const spot = await underlyingQuote(index); // Recheck spot after a potentially slow chain fetch.
  return chooseContract(chain, index, side, spot.price);
}
export async function optionQuote(instrument: string) {
  const r = record(record(unwrap(await call("get_quotes", { instruments: [instrument] })))[instrument]);
  assertFresh(r.last_trade_time);
  if (r.timestamp) assertFresh(r.timestamp);
  const depth = record(r.depth), buy = Array.isArray(depth.buy) ? record(depth.buy[0]) : {}, sell = Array.isArray(depth.sell) ? record(depth.sell[0]) : {};
  const bid = Number(buy.price), ask = Number(sell.price), bidUnits = Number(buy.quantity), askUnits = Number(sell.quantity);
  if (![bid, ask, bidUnits, askUnits].every(Number.isFinite) || bid <= 0 || ask < bid || bidUnits < 1 || askUnits < 1 || (ask - bid) / ((ask + bid) / 2) > 0.05) throw new Error("Valid option bid/ask depth and a spread ≤5% are required.");
  return { bid, ask, bidUnits, askUnits };
}
