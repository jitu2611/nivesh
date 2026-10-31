import type { LastBuy } from "./workspace-types";
function executionTime(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  let raw = value.trim();
  raw = raw.replace(/^(\d{2})[/-](\d{2})[/-](\d{4})([ T])/, "$3-$2-$1$4");
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(raw)) return;
  raw = raw.replace(" ", "T");
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) raw += "+05:30";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 60000) return;
  return date.toISOString();
}
export function normalizeBuy(value: unknown, source: LastBuy["source"]): LastBuy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const r = value as Record<string, unknown>;
  if (String(r.transaction_type ?? r.trade_type ?? "").toUpperCase() !== "BUY") return;
  const exchange = String(r.exchange ?? "").toUpperCase();
  const symbol = String(r.tradingsymbol ?? r.symbol ?? "").toUpperCase().trim();
  if (!/^(NSE|BSE)$/.test(exchange) || !/^[A-Z0-9&_.-]{1,30}$/.test(symbol)) return;
  if (r.segment && !/^(EQ|EQUITY|CASH)$/i.test(String(r.segment))) return;
  if (r.product && !/^(CNC|MTF)$/i.test(String(r.product))) return;
  // Do not treat intraday fills, order placement times, dates without execution
  // times, or holdings' average costs as a delivery purchase.
  if (source === "kite-tradebook" && !r.product) return;
  const price = Number(r.average_price ?? r.price);
  const quantity = Number(r.quantity);
  const at = executionTime(r.fill_timestamp ?? r.exchange_timestamp ?? r.order_execution_time);
  const tradeId = String(r.trade_id ?? "").trim();
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !at || !tradeId) return;
  return { instrument: `${exchange}:${symbol}`, price, quantity, at, tradeId, source };
}
export function latestBuys(existing: Record<string, LastBuy>, records: LastBuy[]) {
  const merged = { ...existing };
  for (const buy of records) {
    const previous = merged[buy.instrument];
    // Execution timestamp is authoritative; trade ID only orders equal-time fills.
    if (!previous || buy.at > previous.at || (buy.at === previous.at && buy.tradeId.localeCompare(previous.tradeId, undefined, { numeric: true }) > 0)) merged[buy.instrument] = buy;
  }
  return merged;
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const pushRow = () => { row.push(cell); if (row.some(c => c.trim())) rows.push(row); row = []; cell = ""; if (rows.length > 10000) throw new Error("Import at most 10,000 CSV rows at a time."); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[i + 1] === "\n") i++; pushRow(); }
    else cell += char;
  }
  if (quoted) throw new Error("Unclosed quotation in CSV.");
  if (cell || row.length) pushRow();
  return rows;
}
export function importBuyCsv(text: string, deliveryOnly = false): { buys: LastBuy[]; skipped: number } {
  if (!text || text.length > 500000) throw new Error("Choose a CSV smaller than 500 KB.");
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = (rows.shift() || []).map(h => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  for (const names of [["symbol", "tradingsymbol"], ["exchange"], ["trade_type", "transaction_type"], ["price", "average_price"], ["quantity"], ["trade_id"], ["order_execution_time", "fill_timestamp", "exchange_timestamp"]]) {
    if (!names.some(name => headers.includes(name))) throw new Error(`CSV needs ${names.join(" or ")}. Export the Console tradebook with execution timestamps; a holdings or P&L export is not sufficient.`);
  }
  if (!headers.includes("product") && !deliveryOnly) throw new Error("This CSV has no Product column. Filter it to delivery buys and confirm that before importing; intraday buys must not become a holdings baseline.");
  const buys: LastBuy[] = []; let skipped = 0;
  for (const row of rows) {
    const record = Object.fromEntries(headers.map((h, i) => [h, (row[i] || "").trim()]));
    const buy = normalizeBuy(record, "console-csv");
    if (buy) buys.push(buy); else skipped++;
  }
  if (!buys.length) throw new Error("No valid executed equity BUY fills found. Check execution times, trade IDs and prices; SELL/intraday/derivative rows are not imported.");
  return { buys, skipped };
}
