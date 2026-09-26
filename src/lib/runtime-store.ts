import "server-only";

import { copyFile, mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { BotSleeve } from "@/lib/types";

const directory = process.env.NIVESH_DATA_DIR || join(process.cwd(), ".nivesh-data");
const runtimeFile = join(directory, "runtime.json");
const legacySettingsFile = join(directory, "settings.json");
const legacySleeveFile = join(directory, "bot-sleeve.json");

export type RuntimeSettings = {
  capital: number;
  cashReservePercent: number;
  mode: "simulation";
  paused: boolean;
  updatedAt: string;
};

type RuntimeState = {
  version: 1;
  settings: RuntimeSettings;
  sleeve: BotSleeve;
};

type JsonRecord = Record<string, unknown>;

const globalStore = globalThis as typeof globalThis & { niveshStoreTail?: Promise<unknown> };

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function finite(value: unknown, label: string, minimum = 0) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < minimum) throw new Error(`Stored ${label} is invalid.`);
  return number;
}

function iso(value: unknown, fallback = new Date().toISOString()) {
  const parsed = new Date(String(value ?? ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function defaultSettings(): RuntimeSettings {
  return {
    capital: 1_500_000,
    cashReservePercent: 20,
    mode: "simulation",
    paused: false,
    updatedAt: new Date(0).toISOString(),
  };
}

function createEmptySleeve(settings: RuntimeSettings): BotSleeve {
  const now = new Date().toISOString();
  return {
    revision: 0,
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
    mode: "simulation",
    asOf: now,
  };
}

function parseSettings(value: unknown): RuntimeSettings {
  const item = record(value);
  if (!item) throw new Error("Stored runtime settings are invalid.");
  const capital = finite(item.capital, "capital", 10_000);
  const reserve = finite(item.cashReservePercent ?? 20, "cash reserve");
  if (reserve >= 100) throw new Error("Stored cash reserve is invalid.");
  return {
    capital,
    cashReservePercent: reserve,
    mode: "simulation",
    paused: item.paused === true,
    updatedAt: iso(item.updatedAt, new Date(0).toISOString()),
  };
}

function parseSleeve(value: unknown): BotSleeve {
  const item = record(value);
  if (!item) throw new Error("Stored paper ledger is invalid.");
  const capital = finite(item.capital, "ledger capital", 10_000);
  const cash = finite(item.cash, "ledger cash");
  const positions = Array.isArray(item.positions) ? item.positions : undefined;
  const trades = Array.isArray(item.trades) ? item.trades : undefined;
  const decisions = Array.isArray(item.decisions) ? item.decisions : undefined;
  const history = Array.isArray(item.history) ? item.history : undefined;
  if (!positions || !trades || !decisions || !history) throw new Error("Stored paper ledger collections are invalid.");

  return {
    ...(item as unknown as BotSleeve),
    revision: Math.max(0, Math.floor(finite(item.revision ?? 0, "ledger revision"))),
    capital,
    cash,
    invested: finite(item.invested ?? 0, "invested value"),
    currentValue: finite(item.currentValue ?? capital, "current value"),
    pnl: finiteSigned(item.pnl ?? 0, "P&L"),
    realisedPnl: finiteSigned(item.realisedPnl ?? 0, "realised P&L"),
    returnPercent: finiteSigned(item.returnPercent ?? 0, "return"),
    fees: finite(item.fees ?? 0, "fees"),
    positions: positions as BotSleeve["positions"],
    trades: trades as BotSleeve["trades"],
    decisions: decisions as BotSleeve["decisions"],
    history: history as BotSleeve["history"],
    mode: "simulation",
    asOf: iso(item.asOf),
  };
}

function finiteSigned(value: unknown, label: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`Stored ${label} is invalid.`);
  return number;
}

function parseState(value: unknown): RuntimeState {
  const item = record(value);
  if (!item) throw new Error("Stored runtime state is invalid.");
  const settings = parseSettings(item.settings);
  return { version: 1, settings, sleeve: parseSleeve(item.sleeve) };
}

async function readParsed<T>(path: string, parser: (value: unknown) => T): Promise<T | undefined> {
  try {
    return parser(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function readState() {
  try {
    const state = await readParsed(runtimeFile, parseState);
    if (state) return state;
  } catch (primaryError) {
    try {
      const backup = await readParsed(`${runtimeFile}.bak`, parseState);
      if (backup) return backup;
    } catch {
      // The primary error below is more actionable than a second parse failure.
    }
    throw new Error(`Nivesh runtime data is corrupted: ${primaryError instanceof Error ? primaryError.message : "unknown error"}`);
  }

  const settings = (await readParsed(legacySettingsFile, parseSettings)) ?? defaultSettings();
  const sleeve = (await readParsed(legacySleeveFile, parseSleeve)) ?? createEmptySleeve(settings);
  const migrated = { version: 1 as const, settings: { ...settings, capital: sleeve.capital }, sleeve };
  await writeState(migrated);
  return migrated;
}

async function writeState(state: RuntimeState) {
  const validated = parseState(state);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const current = await readParsed(runtimeFile, parseState);
    if (current) await copyFile(runtimeFile, `${runtimeFile}.bak`);
  } catch {
    // Never replace a known-good backup with corrupt primary data.
  }

  const temporary = `${runtimeFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, runtimeFile);
}

async function serial<T>(operation: () => Promise<T>): Promise<T> {
  const previous = globalStore.niveshStoreTail ?? Promise.resolve();
  let release!: () => void;
  globalStore.niveshStoreTail = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

function markedSleeve(stored: BotSleeve): BotSleeve {
  const positionValue = stored.positions.reduce((sum, position) => sum + position.value, 0);
  const currentValue = stored.cash + positionValue;
  const pnl = currentValue - stored.capital;
  return {
    ...stored,
    currentValue,
    invested: positionValue,
    pnl,
    returnPercent: stored.capital > 0 ? pnl / stored.capital * 100 : 0,
    mode: "simulation",
    asOf: new Date().toISOString(),
  };
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  return serial(async () => ({ ...(await readState()).settings }));
}

export async function saveRuntimeSettings(patch: { capital?: number; paused?: boolean }): Promise<RuntimeSettings> {
  return serial(async () => {
    const state = await readState();
    const capital = patch.capital ?? state.settings.capital;
    if (!Number.isFinite(capital) || capital < 10_000 || capital > 100_000_000) throw new Error("Capital is outside the supported range.");
    const delta = capital - state.sleeve.capital;
    if (delta < 0 && state.sleeve.cash + delta < 0) throw new Error("Bot capital cannot be reduced below the amount currently invested.");

    const now = new Date().toISOString();
    const nextSettings: RuntimeSettings = {
      ...state.settings,
      capital,
      paused: patch.paused ?? state.settings.paused,
      mode: "simulation",
      updatedAt: now,
    };
    const nextSleeve: BotSleeve = {
      ...state.sleeve,
      revision: state.sleeve.revision + 1,
      capital,
      cash: state.sleeve.cash + delta,
      currentValue: state.sleeve.currentValue + delta,
      pnl: state.sleeve.currentValue + delta - capital,
      mode: "simulation",
      history: delta === 0 ? state.sleeve.history : [...state.sleeve.history, { timestamp: now, value: state.sleeve.currentValue + delta, capital }].slice(-500),
      asOf: now,
    };
    await writeState({ version: 1, settings: nextSettings, sleeve: nextSleeve });
    return nextSettings;
  });
}

export async function getBotSleeve(): Promise<BotSleeve> {
  return serial(async () => {
    const state = await readState();
    return markedSleeve(state.sleeve);
  });
}

export async function saveBotSleeve(sleeve: BotSleeve): Promise<BotSleeve> {
  return serial(async () => {
    const state = await readState();
    if (sleeve.revision !== state.sleeve.revision) throw new Error("The paper ledger changed during this operation. Refresh and retry.");
    const next = { ...sleeve, revision: sleeve.revision + 1, mode: "simulation" as const, asOf: new Date().toISOString() };
    await writeState({ ...state, sleeve: next });
    return next;
  });
}
