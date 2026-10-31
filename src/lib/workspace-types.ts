export type Period = 1 | 3 | 7 | 30;
export type HealthPeriod = Period | "6m" | "1y";
export type HealthBaseline = { targetDate: string; date: string | null; close: number | null };
export type HealthComparison = { targetDate: string; baselineValue: number | null; currentValue: number | null; changeAmount: number | null; changePercent: number | null; covered: number; total: number };
export type PriceRow = {
  instrument: string; price: number; quantity: number; average: number;
  changes: Record<Period, number | null>; error?: string;
  healthBaselines?: Partial<Record<HealthPeriod, HealthBaseline>>;
  signal?: { enter: boolean; exit: boolean; day: string; reason: string };
};
export type PortfolioAnalysis = {
  asOf: string; rows: PriceRow[]; changes: Record<Period, number | null>;
  health?: Partial<Record<HealthPeriod, HealthComparison>>;
  suggestions: Array<{ instrument: string; action: "ADD" | "REDUCE" | "HOLD"; quantity: number; amount: number; reason: string }>;
  methodology: string;
};
export type Algorithm = {
  id: string; name: string; symbols: string[]; scope: "symbols" | "portfolio";
  strategy: "dip" | "momentum" | "sma-cross" | "rsi" | "channel-breakout" | "orb" | "ema-crossover" | "rsi-momentum"; lookback: Period; threshold: number;
  market?: "index-options"; index?: "NIFTY" | "BANKNIFTY"; maxLots?: number; maxTradesPerDay?: number;
  lastSignalId?: string; lastSignalAt?: number; session?: { day: string; startValue: number; entries: number };
  trades?: Array<{ id: string; at: string; side: "BUY" | "SELL"; instrument: string; quantity: number; lots: number; price: number; charges: number; reason: string; pnl?: number }>;
  signalDays?: Record<string, string>;
  budget: number; stopPercent: number; targetPercent: number; enabled: boolean;
  cash: number; realisedPnl: number; lastRun?: string;
  positions: Array<{ instrument: string; quantity: number; entry: number; mark: number; cost: number; openedAt: string; markAt?: string;
    option?: { index: "NIFTY" | "BANKNIFTY"; type: "CE" | "PE"; expiry: string; strike: number; lotSize: number; tickSize: number } }>;
};
export type WorkspaceEvent = { id: string; at: string; category: "algorithm" | "analysis" | "research"; message: string; details?: string };
export type LastBuy = { instrument: string; price: number; quantity: number; at: string; tradeId: string; source: "kite-tradebook" | "console-csv" };
export type WorkspaceState = { version: 1; algorithms: Algorithm[]; archivedAlgorithms?: Algorithm[]; events: WorkspaceEvent[]; analysis?: PortfolioAnalysis; lastBuys?: Record<string, LastBuy>; buySyncAt?: string; buySyncError?: string };
