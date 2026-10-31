export type MutualFundHolding = {
  id: string; fund: string; isin: string | null; folio: string | null;
  units: number | null; averageNav: number | null; nav: number | null; navDate: string | null;
  pledgedUnits: number | null; availableUnits: number | null;
  invested: number | null; value: number | null; pnl: number | null; returnPercent: number | null;
  reportedPnl: number | null;
};
export type MutualFundPortfolio = {
  holdings: MutualFundHolding[]; invested: number | null; value: number | null;
  pnl: number | null; returnPercent: number | null; asOf: string; source: "kite";
};
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function finite(value: unknown, minimum = -Infinity): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum ? number : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}
export function normalizeMutualFunds(payload: unknown, asOf = new Date().toISOString()): MutualFundPortfolio {
  let data = payload;
  for (let i = 0; i < 8 && object(data); i++) {
    const record = object(data)!;
    if (record.holdings !== undefined) { data = record.holdings; break; }
    if (record.mf_holdings !== undefined) { data = record.mf_holdings; break; }
    if (record.data !== undefined) data = record.data;
    else if (record.result !== undefined) data = record.result;
    else break;
  }
  if (!Array.isArray(data)) throw new Error("Kite returned an unsupported mutual-fund holdings format.");
  const holdings = data.map((value, index): MutualFundHolding => {
    const item = object(value);
    if (!item) throw new Error("Kite returned an invalid mutual-fund holding.");
    const isin = text(item.tradingsymbol ?? item.isin);
    const fund = text(item.fund ?? item.scheme_name ?? item.name) || isin;
    if (!fund) throw new Error("Kite returned a mutual-fund holding without a scheme identifier.");
    const folio = text(item.folio ?? item.folio_number);
    const units = finite(item.quantity ?? item.units, 0);
    const average = finite(item.average_price ?? item.average_nav, 0);
    const latest = finite(item.last_price ?? item.nav, 0);
    const averageNav = average !== null && average > 0 ? average : null;
    const nav = latest !== null && latest > 0 ? latest : null;
    const pledgedUnits = finite(item.pledged_quantity, 0);
    const availableUnits = units !== null && pledgedUnits !== null && pledgedUnits <= units ? units - pledgedUnits : null;
    const invested = units === 0 ? 0 : units !== null && averageNav !== null ? finite(units * averageNav, 0) : null;
    const currentValue = units === 0 ? 0 : units !== null && nav !== null ? finite(units * nav, 0) : null;
    const pnl = invested !== null && currentValue !== null ? currentValue - invested : null;
    return {
      id: `${isin || fund}:${folio || "no-folio"}:${index}`, fund, isin, folio,
      units, averageNav, nav, navDate: text(item.last_price_date ?? item.nav_date),
      pledgedUnits, availableUnits, invested, value: currentValue, pnl,
      returnPercent: pnl !== null && invested !== null && invested > 0 ? finite(pnl / invested * 100) : null,
      reportedPnl: finite(item.pnl),
    };
  });
  const sum = (key: "invested" | "value" | "pnl") => holdings.some(h => h[key] === null) ? null : finite(holdings.reduce((total, h) => total + h[key]!, 0));
  const invested = sum("invested"), currentValue = sum("value"), pnl = sum("pnl");
  return { holdings, invested, value: currentValue, pnl, returnPercent: pnl !== null && invested !== null && invested > 0 ? finite(pnl / invested * 100) : null, asOf, source: "kite" };
}
export const mutualFundSortOptions = [
  { key: "fund", label: "Scheme", direction: "asc" },
  { key: "units", label: "Units", direction: "desc" },
  { key: "invested", label: "Invested value", direction: "desc" },
  { key: "value", label: "Current value", direction: "desc" },
  { key: "pnl", label: "Unrealised P&L", direction: "desc" },
  { key: "returnPercent", label: "Absolute return %", direction: "desc" },
  { key: "averageNav", label: "Average purchase NAV", direction: "desc" },
  { key: "nav", label: "Latest NAV", direction: "desc" },
  { key: "navDate", label: "NAV date", direction: "desc" },
  { key: "pledgedUnits", label: "Pledged units", direction: "desc" },
] as const;
export type MutualFundSortKey = typeof mutualFundSortOptions[number]["key"];
export type MutualFundSort = { key: MutualFundSortKey; direction: "asc" | "desc" };
export function sortMutualFunds(holdings: MutualFundHolding[], sort: MutualFundSort) {
  return [...holdings].sort((a, b) => {
    const av = sort.key === "navDate" ? a.navDate ? Date.parse(a.navDate) : null : a[sort.key];
    const bv = sort.key === "navDate" ? b.navDate ? Date.parse(b.navDate) : null : b[sort.key];
    const am = av === null || (typeof av === "number" && !Number.isFinite(av));
    const bm = bv === null || (typeof bv === "number" && !Number.isFinite(bv));
    if (am !== bm) return am ? 1 : -1;
    if (!am && !bm) {
      const delta = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv, "en", { numeric: true }) : Number(av) - Number(bv);
      if (delta) return sort.direction === "asc" ? delta : -delta;
    }
    return a.fund.localeCompare(b.fund) || a.id.localeCompare(b.id);
  });
}
