import type { PaperStrategy } from "@/lib/types";

export const ENTRY_CONFIDENCE_MINIMUM = 65;
export const MAX_RESEARCH_AGE_MS = 60 * 60_000;
export const MAX_POSITION_PERCENT = 0.35;
export const MAX_PREMIUM_RISK_PERCENT = 0.10;

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
  return {
    open: !["Sat", "Sun"].includes(weekday) && minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 25,
    minutes,
  };
}

export function validateInstrument(instrument: string, strategy: PaperStrategy) {
  if (strategy !== "long-option") throw new Error("Only long NIFTY options are permitted in this sandbox.");
  const match = /^(NFO):(NIFTY[A-Z0-9_-]*(?:CE|PE))$/.exec(instrument);
  if (!match) throw new Error("The intent must identify an exact NFO NIFTY CE or PE contract.");
  return { exchange: "NFO" as const, symbol: match[2] };
}

export function estimateCharges(strategy: PaperStrategy, side: "BUY" | "SELL", gross: number) {
  const rate = strategy === "long-option" ? 0.00055 : strategy === "intraday" ? 0.00035 : side === "SELL" ? 0.00125 : 0.0002;
  return Math.max(0.01, gross * rate);
}

export function slippageRate(strategy: PaperStrategy) {
  return strategy === "long-option" ? 0.0015 : strategy === "intraday" ? 0.0008 : 0.0005;
}

type EntryPlanInput = {
  strategy: PaperStrategy;
  livePrice: number;
  stopLoss: number;
  targetPrice: number;
  capital: number;
  cash: number;
  cashReservePercent: number;
  maxCapital: number;
  lotSize: number;
};

export function planPaperEntry(input: EntryPlanInput) {
  const values = Object.values(input).filter((value): value is number => typeof value === "number");
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Paper-entry inputs must be finite numbers.");
  if (input.strategy !== "long-option") throw new Error("Only long NIFTY options are permitted in this sandbox.");
  if (input.capital <= 0 || input.cash < 0 || input.livePrice <= 0 || input.maxCapital <= 0) throw new Error("Capital and prices must be positive.");
  if (!Number.isInteger(input.lotSize) || input.lotSize < 1) throw new Error("A valid whole-number lot size is required.");
  if (input.cashReservePercent < 0 || input.cashReservePercent >= 100) throw new Error("Cash reserve must be between 0% and 100%.");

  const fillPrice = input.livePrice * (1 + slippageRate(input.strategy));
  if (input.stopLoss <= 0 || input.stopLoss >= fillPrice) throw new Error("A valid stop below the simulated fill is required.");
  if (input.targetPrice <= fillPrice) throw new Error("A valid target above the simulated fill is required.");

  const reserve = input.capital * input.cashReservePercent / 100;
  const deployableCash = Math.max(0, input.cash - reserve);
  const positionCap = input.capital * MAX_POSITION_PERCENT;
  const permittedCapital = Math.min(deployableCash, positionCap, input.maxCapital);
  const oneLotGross = fillPrice * input.lotSize;
  const oneLotCost = oneLotGross + estimateCharges(input.strategy, "BUY", oneLotGross);
  const affordableLots = Math.floor(permittedCapital / oneLotCost);
  const riskBudget = input.capital * MAX_PREMIUM_RISK_PERCENT;
  const riskLots = Math.floor(riskBudget / oneLotGross);
  const lots = Math.min(affordableLots, riskLots);
  if (lots < 1) throw new Error("The instrument cannot fit within capital, reserve, position and maximum-loss limits.");

  const quantity = lots * input.lotSize;
  const gross = fillPrice * quantity;
  const entryCharges = estimateCharges(input.strategy, "BUY", gross);
  if (gross + entryCharges > deployableCash || gross + entryCharges > permittedCapital) {
    throw new Error("Estimated fill and charges exceed deployable cash.");
  }

  return { fillPrice, quantity, gross, entryCharges, deployableCash, permittedCapital };
}
