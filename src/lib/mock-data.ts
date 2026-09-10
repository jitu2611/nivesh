import type { Agent, Decision, Holding, NewsItem, Opportunity } from "./types";

export const performance = [
  { day: "02 Sep", portfolio: 982000, nifty: 980000 },
  { day: "05 Sep", portfolio: 991000, nifty: 986000 },
  { day: "08 Sep", portfolio: 986000, nifty: 982000 },
  { day: "11 Sep", portfolio: 1004000, nifty: 991000 },
  { day: "14 Sep", portfolio: 1012000, nifty: 997000 },
  { day: "17 Sep", portfolio: 1008000, nifty: 1001000 },
  { day: "20 Sep", portfolio: 1026000, nifty: 1006000 },
  { day: "23 Sep", portfolio: 1038000, nifty: 1011000 },
  { day: "26 Sep", portfolio: 1046000, nifty: 1016000 },
  { day: "Today", portfolio: 1052840, nifty: 1019000 },
];

export const agents: Agent[] = [
  { id: "news", name: "Pulse", role: "News researcher", status: "analyzing", accent: "#38bdf8", task: "Scanning RBI commentary and company filings" },
  { id: "opportunity", name: "Scout", role: "Opportunity analyst", status: "watching", accent: "#a78bfa", task: "Tracking 7 candidates near entry zones" },
  { id: "bull", name: "Asha", role: "Bull analyst", status: "debating", accent: "#34d399", task: "Building the case for HDFCBANK", confidence: 72 },
  { id: "bear", name: "Virodh", role: "Bear analyst", status: "debating", accent: "#fb7185", task: "Testing margin and valuation risks", confidence: 61 },
  { id: "portfolio", name: "Niti", role: "Portfolio manager", status: "watching", accent: "#fbbf24", task: "Checking financial-sector concentration" },
  { id: "risk", name: "Kavach", role: "Risk guardian", status: "watching", accent: "#f97316", task: "All hard limits within policy" },
];

export const opportunities: Opportunity[] = [
  { symbol: "HDFCBANK", company: "HDFC Bank", price: 1734.6, change: 1.24, score: 82, signal: "Accumulate", thesis: "Deposit growth is stabilising while valuation remains below its long-term range.", horizon: "6–12 months", allocation: 4, risk: "Moderate", updated: "8 min ago" },
  { symbol: "INFY", company: "Infosys", price: 1882.4, change: -0.38, score: 74, signal: "Watch", thesis: "Improving deal pipeline, but near-term discretionary technology spending remains mixed.", horizon: "6–9 months", allocation: 3, risk: "Moderate", updated: "14 min ago" },
  { symbol: "SUNPHARMA", company: "Sun Pharmaceutical", price: 1768.1, change: 0.72, score: 70, signal: "Watch", thesis: "Specialty portfolio momentum offers defensiveness; entry valuation needs patience.", horizon: "9–15 months", allocation: 3, risk: "Low", updated: "21 min ago" },
];

export const news: NewsItem[] = [
  { id: 1, category: "Policy", headline: "RBI maintains policy stance; liquidity guidance draws attention", summary: "Banks and rate-sensitive sectors may react as the market parses liquidity commentary.", source: "RBI release", age: "12 min", impact: "High", symbols: ["HDFCBANK", "ICICIBANK"] },
  { id: 2, category: "Corporate", headline: "Infosys announces expanded cloud partnership with European lender", summary: "The deal supports the large-deal pipeline, though financial terms were not disclosed.", source: "Exchange filing", age: "38 min", impact: "Medium", symbols: ["INFY"] },
  { id: 3, category: "Energy", headline: "Crude prices soften as supply concerns ease", summary: "Lower input costs can support paint, aviation and oil-marketing companies while weighing on upstream producers.", source: "Reuters", age: "54 min", impact: "Medium", symbols: ["ASIANPAINT", "INDIGO", "ONGC"] },
  { id: 4, category: "Markets", headline: "Domestic institutions extend buying streak in large caps", summary: "Institutional flow remains constructive, but foreign participation is still uneven.", source: "NSE provisional data", age: "1 hr", impact: "Low", symbols: ["NIFTY 50"] },
];

export const holdings: Holding[] = [
  { symbol: "RELIANCE", company: "Reliance Industries", quantity: 42, average: 1284.2, ltp: 1376.5, managed: false },
  { symbol: "HDFCBANK", company: "HDFC Bank", quantity: 55, average: 1622.8, ltp: 1734.6, managed: true },
  { symbol: "TCS", company: "Tata Consultancy Services", quantity: 18, average: 3844.1, ltp: 4012.8, managed: false },
  { symbol: "ITC", company: "ITC", quantity: 160, average: 438.6, ltp: 472.15, managed: true },
];

export const decisions: Decision[] = [
  { time: "10:42", symbol: "HDFCBANK", action: "HOLD", detail: "Wait for debate completion before adding", status: "Monitoring" },
  { time: "10:08", symbol: "INFY", action: "REJECTED", detail: "Risk/reward below the required threshold", status: "Closed" },
  { time: "Yesterday", symbol: "ITC", action: "BUY", detail: "Simulated allocation of ₹24,100", status: "Simulated" },
];

export const gainers = [
  { symbol: "BAJFINANCE", price: "₹7,421", move: 3.84 },
  { symbol: "TATAMOTORS", price: "₹987", move: 2.91 },
  { symbol: "SBIN", price: "₹824", move: 2.44 },
  { symbol: "HDFCLIFE", price: "₹713", move: 2.12 },
  { symbol: "LT", price: "₹3,682", move: 1.87 },
];

export const losers = [
  { symbol: "WIPRO", price: "₹524", move: -2.68 },
  { symbol: "ONGC", price: "₹286", move: -2.17 },
  { symbol: "COALINDIA", price: "₹478", move: -1.83 },
  { symbol: "MARUTI", price: "₹12,184", move: -1.42 },
  { symbol: "DRREDDY", price: "₹1,309", move: -1.16 },
];
