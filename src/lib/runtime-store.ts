import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BotSleeve } from "@/lib/types";

const directory = join(process.cwd(), ".nivesh-data");
const settingsFile = join(directory, "settings.json");
const sleeveFile = join(directory, "bot-sleeve.json");

export type RuntimeSettings = {
  capital: number;
  cashReservePercent: number;
  mode: "simulation" | "approval" | "autonomous";
  updatedAt: string;
};

const defaults: RuntimeSettings = {
  capital: 1_500_000,
  cashReservePercent: 20,
  mode: "simulation",
  updatedAt: new Date(0).toISOString(),
};

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(path: string, value: unknown) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  return (await readJson<RuntimeSettings>(settingsFile)) ?? defaults;
}

export async function setRuntimeMode(mode: RuntimeSettings["mode"]): Promise<RuntimeSettings> {
  const current = await getRuntimeSettings();
  const next = { ...current, mode, updatedAt: new Date().toISOString() };
  await writeJson(settingsFile, next);
  return next;
}

export async function saveRuntimeSettings(capital: number): Promise<RuntimeSettings> {
  const current = await getRuntimeSettings();
  const next = { ...current, capital, updatedAt: new Date().toISOString() };
  const sleeve = await readJson<BotSleeve>(sleeveFile);
  let updatedSleeve: BotSleeve;

  if (!sleeve) {
    updatedSleeve = createEmptySleeve(next);
  } else {
    const delta = capital - sleeve.capital;
    if (delta < 0 && sleeve.cash + delta < 0) {
      throw new Error("Bot capital cannot be reduced below the amount currently invested.");
    }
    const now = new Date().toISOString();
    updatedSleeve = {
      ...sleeve,
      capital,
      cash: sleeve.cash + delta,
      currentValue: sleeve.currentValue + delta,
      pnl: sleeve.currentValue + delta - capital,
      history: [...sleeve.history, { timestamp: now, value: sleeve.currentValue + delta, capital }].slice(-500),
      asOf: now,
    };
  }

  await writeJson(sleeveFile, updatedSleeve);
  await writeJson(settingsFile, next);
  return next;
}

function createEmptySleeve(settings: RuntimeSettings): BotSleeve {
  const now = new Date().toISOString();
  return {
    capital: settings.capital,
    cash: settings.capital,
    invested: 0,
    currentValue: settings.capital,
    pnl: 0,
    realisedPnl: 0,
    returnPercent: 0,
    fees: 0,
    positions: [],
    trades: [],
    decisions: [],
    history: [
      { timestamp: settings.updatedAt === new Date(0).toISOString() ? now : settings.updatedAt, value: settings.capital, capital: settings.capital },
      { timestamp: now, value: settings.capital, capital: settings.capital },
    ],
    mode: settings.mode,
    asOf: now,
  };
}

export async function getBotSleeve(): Promise<BotSleeve> {
  const settings = await getRuntimeSettings();
  const stored = await readJson<BotSleeve>(sleeveFile);
  if (!stored) {
    const empty = createEmptySleeve(settings);
    await writeJson(sleeveFile, empty);
    return empty;
  }

  const positionValue = (stored.positions ?? []).reduce((sum, position) => sum + position.value, 0);
  const currentValue = stored.cash + positionValue;
  const pnl = currentValue - stored.capital;
  return {
    ...stored,
    positions: stored.positions ?? [],
    trades: stored.trades ?? [],
    decisions: stored.decisions ?? [],
    realisedPnl: stored.realisedPnl ?? 0,
    fees: stored.fees ?? 0,
    currentValue,
    invested: positionValue,
    pnl,
    returnPercent: stored.capital > 0 ? pnl / stored.capital * 100 : 0,
    mode: settings.mode,
    asOf: new Date().toISOString(),
  };
}

export async function saveBotSleeve(sleeve: BotSleeve) {
  await writeJson(sleeveFile, sleeve);
}
