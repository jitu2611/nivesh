export type AgentStatus = "analyzing" | "debating" | "watching" | "idle";

export type Agent = {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  accent: string;
  task: string;
  confidence?: number;
};

export type Opportunity = {
  symbol: string;
  company: string;
  price: number;
  change: number;
  score: number;
  signal: "Accumulate" | "Watch" | "Avoid";
  thesis: string;
  horizon: string;
  allocation: number;
  risk: "Low" | "Moderate" | "High";
  updated: string;
};

export type NewsItem = {
  id: number;
  category: string;
  headline: string;
  summary: string;
  source: string;
  age: string;
  impact: "High" | "Medium" | "Low";
  symbols: string[];
};

export type Holding = {
  symbol: string;
  company: string;
  quantity: number;
  average: number;
  ltp: number;
  managed: boolean;
  exchange?: string;
  pnl?: number;
  dayChangePercentage?: number;
};

export type LivePortfolio = {
  holdings: Holding[];
  availableCash: number;
  totalValue: number;
  totalPnl: number;
  asOf: string;
  source: "kite";
};

export type PaperStrategy = "delivery" | "intraday" | "long-option";

export type PaperIntent = {
  action: "OPEN_LONG" | "NO_ACTION";
  instrument?: string;
  underlying?: string;
  strategy: PaperStrategy;
  entryPrice?: number;
  stopLoss?: number;
  targetPrice?: number;
  maxHoldingMinutes: number;
  maxCapital: number;
  confidence: number;
  rationale: string;
};

export type PaperPosition = {
  id: string;
  instrument: string;
  symbol: string;
  exchange: "NSE" | "BSE" | "NFO" | "BFO";
  strategy: PaperStrategy;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  value: number;
  pnl: number;
  stopLoss: number;
  targetPrice: number;
  openedAt: string;
  closeBy: string;
  workflowId: string;
  entryCharges: number;
  environment?: "paper" | "live";
  entryOrderId?: string;
  gttTriggerId?: number;
  exitPlan: {
    type: "two-leg-gtt";
    product: "NRML";
    lowerTrigger: number;
    lowerLimit: number;
    upperTrigger: number;
    upperLimit: number;
    status: "active" | "lower-triggered" | "upper-triggered" | "cancelled";
  };
};

export type PaperTrade = {
  id: string;
  positionId: string;
  workflowId: string;
  instrument: string;
  strategy: PaperStrategy;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  grossValue: number;
  charges: number;
  timestamp: string;
  reason: "agent-entry" | "stop-loss" | "target" | "time-exit" | "manual-exit";
  realisedPnl?: number;
};

export type LiveApproval = {
  id: string;
  workflowId: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "executing" | "protected" | "rejected" | "failed" | "flattened";
  instrument: string;
  symbol: string;
  quantity: number;
  lotSize: number;
  referencePrice: number;
  limitPrice: number;
  estimatedValue: number;
  stopLoss: number;
  stopLimit: number;
  targetPrice: number;
  targetLimit: number;
  maximumLossEstimate: number;
  confirmationText: string;
  entryOrderId?: string;
  gttTriggerId?: number;
  message?: string;
};

export type PaperDecision = {
  id: string;
  workflowId: string;
  createdAt: string;
  instrument?: string;
  strategy: PaperStrategy;
  action: "OPEN_LONG" | "NO_ACTION";
  status: "executed" | "rejected" | "no-action";
  message: string;
};

export type BotSleeve = {
  capital: number;
  cash: number;
  invested: number;
  currentValue: number;
  pnl: number;
  realisedPnl: number;
  returnPercent: number;
  fees: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
  decisions: PaperDecision[];
  history: Array<{ timestamp: string; value: number; capital: number }>;
  mode: "simulation" | "approval" | "autonomous";
  asOf: string;
};

export type ResearchReport = {
  agent: string;
  symbol?: string;
  stance: "positive" | "negative" | "neutral" | "watch";
  confidence: number;
  summary: string;
  arguments: string[];
  risks: string[];
  recommendation: string;
  sources: Array<{ title: string; url: string; publishedAt?: string }>;
};

export type ResearchWorkflow = {
  id: string;
  startedAt: string;
  completedAt: string;
  candidate?: string;
  reports: ResearchReport[];
  verdict: ResearchReport;
  paperIntent?: PaperIntent;
  mode: "research-only";
};

export type Decision = {
  time: string;
  symbol: string;
  action: "BUY" | "HOLD" | "REJECTED";
  detail: string;
  status: string;
};
