import "server-only";

import { kiteMcp, resultData, resultText } from "@/lib/kite-mcp";
import { getBotSleeve, getRuntimeSettings, saveBotSleeve } from "@/lib/runtime-store";
import type { BotSleeve, PaperDecision, PaperIntent, PaperPosition, PaperStrategy, PaperTrade, ResearchWorkflow } from "@/lib/types";

type JsonRecord = Record<string, unknown>;

const globalPaper = globalThis as typeof globalThis & { niveshPaperLock?: Promise<unknown> };

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function unwrap(value: unknown): unknown {
  const object = record(value);
  if (!object) return value;
  if (object.data !== undefined) return unwrap(object.data);
  if (object.result !== undefined) return unwrap(object.result);
  return value;
}

function numeric(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function serial<T>(operation: () => Promise<T>): Promise<T> {
  const previous = globalPaper.niveshPaperLock ?? Promise.resolve();
  let release!: () => void;
  globalPaper.niveshPaperLock = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

export function marketClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minutes = Number(value.hour) * 60 + Number(value.minute);
  const weekday = value.weekday;
  return { open: !["Sat", "Sun"].includes(weekday) && minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 25, minutes };
}

function quoteFromData(value: unknown, instrument: string): number | undefined {
  const unwrapped = unwrap(value);
  const object = record(unwrapped);
  if (!object) return undefined;
  const direct = record(object[instrument]);
  const directPrice = numeric(direct?.last_price ?? direct?.ltp);
  if (directPrice && directPrice > 0) return directPrice;
  const ownPrice = numeric(object.last_price ?? object.ltp);
  if (ownPrice && ownPrice > 0) return ownPrice;
  for (const child of Object.values(object)) {
    const found = quoteFromData(child, instrument);
    if (found) return found;
  }
  return undefined;
}

export async function getPrices(instruments: string[]) {
  if (instruments.length === 0) return new Map<string, number>();
  const result = await kiteMcp.callReadOnly("get_ltp", { instruments });
  if (result.isError) throw new Error(resultText(result) || "Kite price lookup failed.");
  const data = resultData(result);
  const prices = new Map<string, number>();
  for (const instrument of instruments) {
    const price = quoteFromData(data, instrument);
    if (price) prices.set(instrument, price);
  }
  return prices;
}

function arrays(value: unknown): unknown[] {
  const unwrapped = unwrap(value);
  if (Array.isArray(unwrapped)) return unwrapped;
  const object = record(unwrapped);
  if (!object) return [];
  for (const child of Object.values(object)) {
    const found = arrays(child);
    if (found.length) return found;
  }
  return [];
}

export async function lotSize(instrument: string, strategy: PaperStrategy) {
  if (strategy !== "long-option") throw new Error("Only long NIFTY options are permitted in this sandbox.");
  const symbol = instrument.split(":")[1];
  const result = await kiteMcp.callReadOnly("search_instruments", { query: symbol, filter_on: "tradingsymbol", limit: 20 });
  if (result.isError) throw new Error("Could not validate the NIFTY option contract lot size.");
  const match = arrays(resultData(result)).map(record).find((item) => String(item?.tradingsymbol ?? "").toUpperCase() === symbol);
  const identity = String(match?.underlying ?? match?.underlying_symbol ?? match?.name ?? "").trim().toUpperCase();
  const instrumentType = String(match?.instrument_type ?? "").trim().toUpperCase();
  const segment = String(match?.segment ?? match?.exchange ?? "").trim().toUpperCase();
  if (!match || identity !== "NIFTY" || !["CE", "PE"].includes(instrumentType) || !segment.includes("NFO")) {
    throw new Error("The instrument is not an exact NFO NIFTY call or put contract.");
  }
  const expiry = match.expiry ? new Date(String(match.expiry)) : undefined;
  if (expiry && Number.isFinite(expiry.getTime()) && expiry.getTime() + 86_400_000 < Date.now()) throw new Error("The selected NIFTY option contract has expired.");
  const size = numeric(match.lot_size);
  if (!size || size < 1) throw new Error("The exact NIFTY option contract and lot size could not be validated.");
  return Math.floor(size);
}

function charges(strategy: PaperStrategy, side: "BUY" | "SELL", gross: number) {
  const rate = strategy === "long-option" ? 0.00055 : strategy === "intraday" ? 0.00035 : side === "SELL" ? 0.00125 : 0.0002;
  return Math.max(0.01, gross * rate);
}

function slippageRate(strategy: PaperStrategy) {
  return strategy === "long-option" ? 0.0015 : strategy === "intraday" ? 0.0008 : 0.0005;
}

function appendDecision(sleeve: BotSleeve, workflow: ResearchWorkflow, intent: PaperIntent, status: PaperDecision["status"], message: string) {
  const decision: PaperDecision = {
    id: crypto.randomUUID(),
    workflowId: workflow.id,
    createdAt: new Date().toISOString(),
    instrument: intent.instrument,
    strategy: intent.strategy,
    action: intent.action,
    status,
    message,
  };
  sleeve.decisions = [decision, ...sleeve.decisions].slice(0, 200);
  return decision;
}

export function validateInstrument(instrument: string, strategy: PaperStrategy) {
  if (strategy !== "long-option") throw new Error("Only long NIFTY options are permitted in this sandbox.");
  const match = /^(NFO):(NIFTY[A-Z0-9_-]*(?:CE|PE))$/.exec(instrument);
  if (!match) throw new Error("The intent must identify an exact NFO NIFTY CE or PE contract.");
  return { exchange: "NFO" as const, symbol: match[2] };
}

export async function executeLatestPaperIntent(workflow: ResearchWorkflow) {
  return serial(async () => {
    const sleeve = await getBotSleeve();
    const intent = workflow.paperIntent;
    if (!intent) throw new Error("The latest research has no structured paper intent.");
    if (sleeve.decisions.some((decision) => decision.workflowId === workflow.id)) throw new Error("This research workflow has already been evaluated by the paper engine.");

    if (intent.action === "NO_ACTION") {
      const decision = appendDecision(sleeve, workflow, intent, "no-action", intent.rationale || "The planner chose not to trade.");
      await saveBotSleeve(sleeve);
      return { decision, sleeve };
    }

    try {
      const age = Date.now() - new Date(workflow.completedAt).getTime();
      if (!Number.isFinite(age) || age > 60 * 60_000) throw new Error("Research is older than one hour.");
      if (intent.confidence < 65) throw new Error("Planner confidence is below the 65% paper-entry threshold.");
      if (!intent.instrument) throw new Error("No exact tradable instrument was provided.");
      const clock = marketClock();
      if (!clock.open) throw new Error("The Indian cash market is closed; no simulated fill was created.");
      if (intent.strategy === "intraday" && clock.minutes > 15 * 60 + 5) throw new Error("It is too late to open a new intraday paper position.");
      if (sleeve.positions.length > 0) throw new Error("Only one NIFTY option position may be open at a time.");

      const { exchange, symbol } = validateInstrument(intent.instrument, intent.strategy);
      const livePrice = (await getPrices([intent.instrument])).get(intent.instrument);
      if (!livePrice) throw new Error("A current Kite price was unavailable.");
      if (!intent.stopLoss || intent.stopLoss >= livePrice) throw new Error("A valid stop below the current price is required.");
      if (!intent.targetPrice || intent.targetPrice <= livePrice) throw new Error("A valid target above the current price is required.");
      if (intent.entryPrice && Math.abs(intent.entryPrice - livePrice) / livePrice > 0.03) throw new Error("Price moved more than 3% from the planner's reference.");

      const settings = await getRuntimeSettings();
      const reserve = sleeve.capital * settings.cashReservePercent / 100;
      const deployableCash = Math.max(0, sleeve.cash - reserve);
      const positionCap = sleeve.capital * 0.35;
      const permittedCapital = Math.min(deployableCash, positionCap, intent.maxCapital);
      const lot = await lotSize(intent.instrument, intent.strategy);
      const fillPrice = livePrice * (1 + slippageRate(intent.strategy));
      const perUnitRisk = intent.strategy === "long-option" ? fillPrice : fillPrice - intent.stopLoss;
      const riskPercent = intent.strategy === "intraday" ? 0.01 : intent.strategy === "long-option" ? 0.10 : 0.02;
      const riskBudget = sleeve.capital * riskPercent;
      const affordableLots = Math.floor(permittedCapital / (fillPrice * lot));
      const riskLots = Math.floor(riskBudget / (perUnitRisk * lot));
      const quantity = Math.min(affordableLots, riskLots) * lot;
      if (quantity < lot) throw new Error("The instrument cannot fit within capital, reserve, position and maximum-loss limits.");

      const gross = fillPrice * quantity;
      const entryCharges = charges(intent.strategy, "BUY", gross);
      if (gross + entryCharges > deployableCash) throw new Error("Estimated fill and charges exceed deployable cash.");
      const now = new Date();
      const holdingMinutes = intent.strategy === "intraday" ? Math.min(intent.maxHoldingMinutes, 15 * 60 + 15 - clock.minutes) : intent.maxHoldingMinutes;
      const closeBy = new Date(now.getTime() + holdingMinutes * 60_000).toISOString();
      const position: PaperPosition = {
        id: crypto.randomUUID(),
        instrument: intent.instrument,
        symbol,
        exchange,
        strategy: intent.strategy,
        quantity,
        averagePrice: fillPrice,
        lastPrice: livePrice,
        value: livePrice * quantity,
        pnl: livePrice * quantity - gross - entryCharges,
        stopLoss: intent.stopLoss,
        targetPrice: intent.targetPrice,
        openedAt: now.toISOString(),
        closeBy,
        workflowId: workflow.id,
        entryCharges,
        exitPlan: {
          type: "two-leg-gtt",
          product: "NRML",
          lowerTrigger: intent.stopLoss,
          lowerLimit: intent.stopLoss * 0.995,
          upperTrigger: intent.targetPrice,
          upperLimit: intent.targetPrice * 0.995,
          status: "active",
        },
      };
      const trade: PaperTrade = {
        id: crypto.randomUUID(),
        positionId: position.id,
        workflowId: workflow.id,
        instrument: intent.instrument,
        strategy: intent.strategy,
        side: "BUY",
        quantity,
        price: fillPrice,
        grossValue: gross,
        charges: entryCharges,
        timestamp: now.toISOString(),
        reason: "agent-entry",
      };
      sleeve.cash -= gross + entryCharges;
      sleeve.positions.push(position);
      sleeve.trades = [trade, ...sleeve.trades].slice(0, 500);
      sleeve.fees += entryCharges;
      sleeve.invested = sleeve.positions.reduce((sum, item) => sum + item.value, 0);
      sleeve.currentValue = sleeve.cash + sleeve.invested;
      sleeve.pnl = sleeve.currentValue - sleeve.capital;
      sleeve.returnPercent = sleeve.pnl / sleeve.capital * 100;
      sleeve.asOf = now.toISOString();
      sleeve.history.push({ timestamp: now.toISOString(), value: sleeve.currentValue, capital: sleeve.capital });
      const decision = appendDecision(sleeve, workflow, intent, "executed", `Paper bought ${quantity} ${symbol} at ${fillPrice.toFixed(2)} including simulated slippage.`);
      await saveBotSleeve(sleeve);
      return { decision, sleeve };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Paper risk validation failed.";
      const decision = appendDecision(sleeve, workflow, intent, "rejected", message);
      await saveBotSleeve(sleeve);
      return { decision, sleeve };
    }
  });
}

function closePosition(sleeve: BotSleeve, position: PaperPosition, livePrice: number, reason: PaperTrade["reason"]) {
  const fillPrice = livePrice * (1 - slippageRate(position.strategy));
  const gross = fillPrice * position.quantity;
  const exitCharges = charges(position.strategy, "SELL", gross);
  const realisedPnl = gross - exitCharges - position.averagePrice * position.quantity - position.entryCharges;
  const trade: PaperTrade = {
    id: crypto.randomUUID(),
    positionId: position.id,
    workflowId: position.workflowId,
    instrument: position.instrument,
    strategy: position.strategy,
    side: "SELL",
    quantity: position.quantity,
    price: fillPrice,
    grossValue: gross,
    charges: exitCharges,
    timestamp: new Date().toISOString(),
    reason,
    realisedPnl,
  };
  sleeve.cash += gross - exitCharges;
  sleeve.realisedPnl += realisedPnl;
  sleeve.fees += exitCharges;
  sleeve.trades = [trade, ...sleeve.trades].slice(0, 500);
}

export async function reconcilePaperSleeve() {
  return serial(async () => {
    const sleeve = await getBotSleeve();
    if (sleeve.positions.length === 0) return sleeve;
    const prices = await getPrices(sleeve.positions.map((position) => position.instrument));
    const clock = marketClock();
    const remaining: PaperPosition[] = [];
    for (const position of sleeve.positions) {
      const price = prices.get(position.instrument) ?? position.lastPrice;
      position.lastPrice = price;
      position.value = price * position.quantity;
      position.pnl = position.value - position.averagePrice * position.quantity - position.entryCharges;
      let reason: PaperTrade["reason"] | undefined;
      if (clock.open && price <= position.stopLoss) {
        position.exitPlan.status = "lower-triggered";
        reason = "stop-loss";
      } else if (clock.open && price >= position.targetPrice) {
        position.exitPlan.status = "upper-triggered";
        reason = "target";
      }
      else if (clock.open && Date.now() >= new Date(position.closeBy).getTime()) {
        position.exitPlan.status = "cancelled";
        reason = "time-exit";
      }
      if (reason) closePosition(sleeve, position, price, reason);
      else remaining.push(position);
    }
    sleeve.positions = remaining;
    sleeve.invested = remaining.reduce((sum, position) => sum + position.value, 0);
    sleeve.currentValue = sleeve.cash + sleeve.invested;
    sleeve.pnl = sleeve.currentValue - sleeve.capital;
    sleeve.returnPercent = sleeve.pnl / sleeve.capital * 100;
    sleeve.asOf = new Date().toISOString();
    const lastPoint = sleeve.history.at(-1);
    if (!lastPoint || Date.now() - new Date(lastPoint.timestamp).getTime() >= 15 * 60_000 || Math.abs(lastPoint.value - sleeve.currentValue) >= 1) {
      sleeve.history = [...sleeve.history, { timestamp: sleeve.asOf, value: sleeve.currentValue, capital: sleeve.capital }].slice(-500);
    }
    await saveBotSleeve(sleeve);
    return sleeve;
  });
}
