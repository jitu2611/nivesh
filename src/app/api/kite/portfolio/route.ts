import { NextResponse } from "next/server";
import { kiteMcp, resultData, resultText, type McpResult } from "@/lib/kite-mcp";
import type { Holding, LivePortfolio } from "@/lib/types";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unwrap(value: unknown): unknown {
  const object = record(value);
  if (!object) return value;
  if (object.data !== undefined) return unwrap(object.data);
  if (object.result !== undefined) return unwrap(object.result);
  return value;
}

function asArray(value: unknown, key?: string): unknown[] {
  const unwrapped = unwrap(value);
  if (Array.isArray(unwrapped)) return unwrapped;
  const object = record(unwrapped);
  if (key && Array.isArray(object?.[key])) return object[key] as unknown[];
  return [];
}

function assertResult(result: McpResult, label: string) {
  if (result.isError) {
    const message = resultText(result);
    throw new Error(message || `Kite ${label} request failed.`);
  }
  return resultData(result);
}

function normalizeHolding(value: unknown): Holding | undefined {
  const item = record(value);
  if (!item) return undefined;
  const symbol = String(item.tradingsymbol ?? item.symbol ?? "").trim();
  if (!symbol) return undefined;
  const quantity = number(item.quantity);
  const average = number(item.average_price ?? item.average);
  const ltp = number(item.last_price ?? item.ltp);
  const calculatedPnl = quantity * (ltp - average);

  return {
    symbol,
    company: String(item.company_name ?? item.name ?? symbol),
    quantity,
    average,
    ltp,
    managed: false,
    exchange: String(item.exchange ?? "NSE"),
    pnl: number(item.pnl) || calculatedPnl,
    dayChangePercentage: number(item.day_change_percentage),
  };
}

function availableCash(value: unknown) {
  const root = record(unwrap(value)) ?? {};
  const equity = record(root.equity) ?? root;
  const available = record(equity.available) ?? {};
  return number(available.live_balance ?? available.cash ?? equity.net ?? available.opening_balance);
}

export async function GET() {
  try {
    const [holdingsResult, marginsResult, positionsResult] = await Promise.all([
      kiteMcp.callReadOnly("get_holdings"),
      kiteMcp.callReadOnly("get_margins"),
      kiteMcp.callReadOnly("get_positions"),
    ]);

    const holdingsData = assertResult(holdingsResult, "holdings");
    const marginsData = assertResult(marginsResult, "margins");
    const positionsData = assertResult(positionsResult, "positions");
    const holdings = asArray(holdingsData, "holdings").map(normalizeHolding).filter((item): item is Holding => Boolean(item));
    const totalValue = holdings.reduce((sum, item) => sum + item.quantity * item.ltp, 0);
    const totalPnl = holdings.reduce((sum, item) => sum + (item.pnl ?? 0), 0);
    const netPositions = record(unwrap(positionsData))?.net;

    const payload: LivePortfolio & { openPositions: number } = {
      holdings,
      availableCash: availableCash(marginsData),
      totalValue,
      totalPnl,
      openPositions: Array.isArray(netPositions) ? netPositions.length : 0,
      asOf: new Date().toISOString(),
      source: "kite",
    };

    return NextResponse.json(payload, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Kite portfolio.";
    const requiresLogin = /login|log in|authoriz|session|token/i.test(message);
    return NextResponse.json(
      { error: requiresLogin ? "Kite authorization has expired. Please reconnect." : "Unable to load the Kite portfolio right now.", requiresLogin },
      { status: requiresLogin ? 401 : 502, headers: { "cache-control": "no-store" } },
    );
  }
}
