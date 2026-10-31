import type { Holding } from "./types";
import type { LastBuy, Period } from "./workspace-types";
import { sinceLastBuy } from "./holding-verdict";
export const holdingSortOptions = [
  { key: "stock", label: "Stock", direction: "asc" },
  { key: "quantity", label: "Quantity", direction: "desc" },
  { key: "price", label: "Current price", direction: "desc" },
  { key: "value", label: "Holding value", direction: "desc" },
  { key: "pnl", label: "Unrealised P&L", direction: "desc" },
  { key: "buy-date", label: "Last buy · date", direction: "desc" },
  { key: "buy-price", label: "Last buy · price", direction: "desc" },
  { key: "buy-quantity", label: "Last buy · units", direction: "desc" },
  { key: "buy-value", label: "Last buy · amount", direction: "desc" },
  { key: "buy-change", label: "Last buy · % change", direction: "asc" },
  { key: "1d", label: "1-day change", direction: "asc" },
  { key: "7d", label: "7-day change", direction: "asc" },
  { key: "30d", label: "30-day change", direction: "asc" },
  { key: "verdict", label: "Verdict · review priority", direction: "asc" },
] as const;
export type HoldingSortKey = typeof holdingSortOptions[number]["key"];
export type HoldingSort = { key: HoldingSortKey; direction: "asc" | "desc" };
export type SortableHolding = { holding: Holding; buy?: LastBuy; changes?: Partial<Record<Period, number | null>>; verdict: { label: string } };
function value(row: SortableHolding, key: HoldingSortKey): number | string | null {
  const { holding: h, buy } = row;
  switch (key) {
    case "stock": return h.symbol;
    case "quantity": return h.quantity;
    case "price": return h.ltp;
    case "value": return h.quantity * h.ltp;
    case "pnl": return h.pnl ?? h.quantity * (h.ltp - h.average);
    case "buy-date": return buy ? Date.parse(buy.at) : null;
    case "buy-price": return buy?.price ?? null;
    case "buy-quantity": return buy?.quantity ?? null;
    case "buy-value": return buy ? buy.price * buy.quantity : null;
    case "buy-change": return sinceLastBuy(h.ltp, buy)?.percent ?? null;
    case "1d": return row.changes?.[1] ?? null;
    case "7d": return row.changes?.[7] ?? null;
    case "30d": return row.changes?.[30] ?? null;
    case "verdict": {
      const priority = ["Review downside risk", "Pause additions", "Refresh prices", "Need buy record", "Review profit-taking", "Hold / check exposure", "Hold / monitor"].indexOf(row.verdict.label);
      return priority < 0 ? null : priority;
    }
  }
}
function missing(v: number | string | null) { return v === null || (typeof v === "number" && !Number.isFinite(v)); }
export function sortHoldingRows<T extends SortableHolding>(rows: T[], sort: HoldingSort): T[] {
  return [...rows].sort((a, b) => {
    const av = value(a, sort.key), bv = value(b, sort.key);
    const am = missing(av), bm = missing(bv);
    if (am !== bm) return am ? 1 : -1; // Missing records remain last in both directions.
    if (!am && !bm) {
      const delta = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv, "en", { numeric: true, sensitivity: "base" }) : Number(av) - Number(bv);
      if (delta) return sort.direction === "asc" ? delta : -delta;
    }
    return `${a.holding.symbol}:${a.holding.exchange || "NSE"}`.localeCompare(`${b.holding.symbol}:${b.holding.exchange || "NSE"}`, "en", { numeric: true });
  });
}
export function nextHoldingSort(previous: HoldingSort, key: HoldingSortKey): HoldingSort {
  if (key === previous.key) return { key, direction: previous.direction === "asc" ? "desc" : "asc" };
  return { key, direction: holdingSortOptions.find(option => option.key === key)!.direction };
}
