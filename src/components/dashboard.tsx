"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleGauge,
  Clock3,
  FileClock,
  ExternalLink,
  IndianRupee,
  LayoutDashboard,
  LoaderCircle,
  LogIn,
  Menu,
  Newspaper,
  Pause,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import {
  agents,
  decisions,
  gainers,
  holdings as mockHoldings,
  losers,
  news,
  opportunities,
} from "@/lib/mock-data";
import type { BotSleeve, Holding, LivePortfolio, ResearchWorkflow } from "@/lib/types";

const navItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { id: "opportunities", label: "Opportunities", icon: Target },
  { id: "news", label: "Market news", icon: Newspaper },
  { id: "agents", label: "Agent room", icon: Bot },
  { id: "decisions", label: "Decisions", icon: FileClock },
  { id: "settings", label: "Risk & capital", icon: Settings2 },
] as const;

type View = (typeof navItems)[number]["id"];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

function StatusDot({ status }: { status: string }) {
  const active = status === "analyzing" || status === "debating";
  return (
    <span className={`status-dot ${active ? "status-dot-active" : ""}`}>
      <span />
    </span>
  );
}

function CapitalDialog({
  capital,
  onSave,
  onClose,
}: {
  capital: number;
  onSave: (value: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(capital.toString());
  const value = Number(draft) || 0;
  const valid = value >= 10000 && value <= 100000000;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="capital-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <div>
            <span className="eyebrow">Allocation guardrail</span>
            <h2>Configure bot capital</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        <p className="dialog-copy">This is the maximum capital Nivesh may manage. It does not transfer funds or enable live trading.</p>
        <label className="amount-field">
          <span>Capital limit</span>
          <div><IndianRupee size={20} /><input autoFocus inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ""))} /></div>
        </label>
        <div className="quick-values">
          {[500000, 1000000, 2500000, 5000000].map((amount) => (
            <button key={amount} onClick={() => setDraft(String(amount))}>{formatCurrency(amount)}</button>
          ))}
        </div>
        <div className="allocation-preview">
          <div><span>Cash reserve</span><strong>{formatCurrency(value * 0.2)}</strong></div>
          <div><span>Maximum initial position</span><strong>{formatCurrency(value * 0.05)}</strong></div>
          <div><span>Maximum single stock</span><strong>{formatCurrency(value * 0.1)}</strong></div>
        </div>
        <div className="dialog-actions">
          <button className="button-secondary" onClick={onClose}>Cancel</button>
          <button className="button-primary" disabled={!valid} onClick={() => { onSave(value); onClose(); }}><Check size={16} /> Save allocation</button>
        </div>
      </section>
    </div>
  );
}

type KiteState = "checking" | "connected" | "disconnected" | "error";

function KiteDialog({
  state,
  connecting,
  error,
  onConnect,
  onCheck,
  onClose,
}: {
  state: KiteState;
  connecting: boolean;
  error: string;
  onConnect: () => void;
  onCheck: () => void;
  onClose: () => void;
}) {
  const connected = state === "connected";
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="capital-dialog kite-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <div><span className="eyebrow">Read-only brokerage access</span><h2>Connect Zerodha Kite</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        <div className={`kite-connection-state ${connected ? "kite-state-connected" : ""}`}>
          <span className="kite-logo large-kite">K</span>
          <div><strong>{connected ? "Kite is authorized" : "Authentication required"}</strong><p>{connected ? "Nivesh can read portfolio and market data. Trading tools remain unavailable." : "Sign in on Zerodha’s secure page. Your password and 2FA never pass through Nivesh."}</p></div>
          {connected && <Check size={19} />}
        </div>
        <ul className="permission-list">
          <li><Check size={14} /> Read holdings, positions and available margins</li>
          <li><Check size={14} /> Read quotes, orders and trading history</li>
          <li><ShieldCheck size={14} /> No place, modify or cancel order permission for agents</li>
        </ul>
        {error && <div className="connection-error">{error}</div>}
        <div className="dialog-actions">
          <button className="button-secondary" onClick={onCheck} disabled={state === "checking"}>{state === "checking" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Check connection</button>
          {!connected && <button className="button-primary" onClick={onConnect} disabled={connecting}>{connecting ? <LoaderCircle className="spin" size={15} /> : <LogIn size={15} />} {connecting ? "Opening Kite…" : "Authenticate with Kite"}<ExternalLink size={13} /></button>}
        </div>
      </section>
    </div>
  );
}

function OpportunityCard({ index }: { index: number }) {
  const item = opportunities[index];
  const [expanded, setExpanded] = useState(index === 0);
  return (
    <article className={`opportunity ${expanded ? "opportunity-expanded" : ""}`}>
      <button className="opportunity-main" onClick={() => setExpanded(!expanded)}>
        <div className="company-mark">{item.symbol.slice(0, 2)}</div>
        <div className="company-name"><strong>{item.symbol}</strong><span>{item.company}</span></div>
        <div className="quote"><strong>{formatCurrency(item.price)}</strong><span className={item.change >= 0 ? "positive" : "negative"}>{item.change >= 0 ? "+" : ""}{item.change}%</span></div>
        <div className="score-ring" style={{ "--score": `${item.score * 3.6}deg` } as React.CSSProperties}><span>{item.score}</span></div>
        <span className={`signal signal-${item.signal.toLowerCase()}`}>{item.signal}</span>
        <ChevronDown className={expanded ? "chevron-open" : ""} size={18} />
      </button>
      {expanded && (
        <div className="opportunity-detail">
          <p>{item.thesis}</p>
          <div className="detail-grid">
            <div><span>Suggested allocation</span><strong>{item.allocation}%</strong></div>
            <div><span>Time horizon</span><strong>{item.horizon}</strong></div>
            <div><span>Risk</span><strong>{item.risk}</strong></div>
            <div><span>Research updated</span><strong>{item.updated}</strong></div>
          </div>
          <div className="opportunity-actions"><button className="button-secondary">Open research</button><button className="button-primary">Review proposal</button></div>
        </div>
      )}
    </article>
  );
}

function AgentRoom({ compact = false, workflow, running = false, error = "", onRun }: { compact?: boolean; workflow?: ResearchWorkflow | null; running?: boolean; error?: string; onRun?: () => void }) {
  const visibleReports = compact ? workflow?.reports.slice(-2) : workflow?.reports;
  return (
    <section className="panel agent-room">
      <div className="panel-head">
        <div><span className="eyebrow">Pi · Research-only orchestration</span><h2>Agent room</h2></div>
        <div className="agent-head-actions"><div className={`live-label ${running ? "" : "agents-ready"}`}><span /> {running ? "Agents working" : workflow ? "Run complete" : "Ready"}</div>{onRun && <button className="button-primary" onClick={onRun} disabled={running}>{running ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}{running ? "Researching…" : "Run live research"}</button>}</div>
      </div>
      <div className="agent-strip">
        {agents.map((agent) => (
          <div className="agent-chip" key={agent.id} title={agent.task}>
            <span className="agent-avatar" style={{ borderColor: agent.accent, color: agent.accent }}>{agent.name.charAt(0)}</span>
            <span><strong>{agent.name}</strong><small>{running ? "queued / working" : workflow ? "completed" : "ready"}</small></span>
            <StatusDot status={running ? "analyzing" : "idle"} />
          </div>
        ))}
      </div>
      {error && <div className="agent-run-error">{error}</div>}
      {running && <div className="agent-loading"><LoaderCircle className="spin" size={22} /><div><strong>Pi agents are researching current evidence</strong><span>Scout and Pulse run first, followed by an independent bull/bear review and portfolio verdict. This can take several minutes.</span></div></div>}
      {!running && !workflow && <div className="agent-empty"><Bot size={23} /><strong>No live research has run yet</strong><span>Start an on-demand, read-only review using current Kite portfolio data and fresh internet sources.</span></div>}
      {!running && workflow && <div className="live-report-list">
        <div className="debate-top"><div>{workflow.candidate && <span className="ticker-pill">{workflow.candidate}</span>}<strong>Live research reports</strong></div><span>{new Date(workflow.completedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></div>
        {visibleReports?.map((report, index) => <article className="live-report" key={`${report.agent}-${index}`}><span className={`report-stance stance-${report.stance}`}>{report.confidence}</span><div><strong>{report.agent}</strong><p>{report.summary}</p>{!compact && report.arguments.length > 0 && <ul>{report.arguments.slice(0, 3).map((argument) => <li key={argument}>{argument}</li>)}</ul>}<footer>{report.sources.slice(0, 3).map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.title}<ExternalLink size={10} /></a>)}</footer></div></article>)}
        <div className="verdict-card"><ShieldCheck size={20} /><div><span>Portfolio verdict · {workflow.verdict.confidence}% confidence</span><strong>{workflow.verdict.recommendation}</strong><p>{workflow.verdict.summary}</p></div></div>
        <div className="debate-footer"><span><Clock3 size={14} /> Research only · No order created</span><span>{workflow.reports.length + 1} structured reports</span></div>
      </div>}
    </section>
  );
}

function MarketRail() {
  const [tab, setTab] = useState<"gainers" | "losers">("gainers");
  const list = tab === "gainers" ? gainers : losers;
  return (
    <aside className="market-rail">
      <section className="panel market-card">
        <div className="rail-heading"><div><span className="eyebrow">NSE · Nifty 100</span><h3>Market movers</h3></div><span className="market-live">Live</span></div>
        <div className="segment-control"><button className={tab === "gainers" ? "active" : ""} onClick={() => setTab("gainers")}>Gainers</button><button className={tab === "losers" ? "active" : ""} onClick={() => setTab("losers")}>Losers</button></div>
        <div className="movers">
          {list.map((item, index) => <div className="mover" key={item.symbol}><span className="rank">{index + 1}</span><strong>{item.symbol}</strong><span>{item.price}</span><em className={item.move > 0 ? "positive" : "negative"}>{item.move > 0 ? "+" : ""}{item.move}%</em></div>)}
        </div>
        <button className="text-button">View complete market <ChevronDown size={14} /></button>
      </section>
      <section className="panel pulse-card">
        <div className="rail-heading"><div><span className="eyebrow">Market pulse</span><h3>India today</h3></div><Activity size={17} /></div>
        <div className="index-row"><div><span>Nifty 50</span><strong>25,118.40</strong></div><em className="positive">+0.62%</em></div>
        <div className="index-row"><div><span>Sensex</span><strong>82,094.12</strong></div><em className="positive">+0.55%</em></div>
        <div className="index-row"><div><span>India VIX</span><strong>12.84</strong></div><em className="negative">+1.12%</em></div>
        <div className="breadth"><span>Market breadth</span><strong>Advances 64%</strong><div><i style={{ width: "64%" }} /></div></div>
      </section>
      <section className="panel guard-card"><ShieldCheck size={20} /><div><strong>Risk guard is active</strong><span>All 8 portfolio rules passing</span></div><ChevronDown size={16} /></section>
    </aside>
  );
}

function Overview({ capital, setCapitalOpen, portfolio, loading, botSleeve }: { capital: number; setCapitalOpen: (open: boolean) => void; portfolio: LivePortfolio | null; loading: boolean; botSleeve: BotSleeve | null }) {
  const totalValue = portfolio?.totalValue ?? 1052840;
  const availableCash = portfolio?.availableCash ?? capital * 0.32;
  const totalPnl = portfolio?.totalPnl ?? 42680;
  const costBasis = totalValue - totalPnl;
  const pnlPercent = costBasis > 0 ? totalPnl / costBasis * 100 : 0;
  const holdingCount = portfolio?.holdings.length ?? mockHoldings.length;
  return (
    <>
      <section className="welcome-row"><div><span className="eyebrow">Tuesday, 29 September · Market open</span><h1>Good morning, Jitesh.</h1><p>{portfolio ? `Live Kite portfolio synced ${new Date(portfolio.asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.` : "Your portfolio is steady. Three agents are evaluating one actionable opportunity."}</p></div><button className="capital-button" onClick={() => setCapitalOpen(true)}><WalletCards size={18} /><span>Bot capital<strong>{formatCurrency(capital)}</strong></span><Settings2 size={15} /></button></section>
      <section className="metrics-grid">
        <article className="metric primary-metric"><div className="metric-label"><span>{portfolio ? "Kite equity holdings" : "Managed portfolio"}</span><CircleGauge size={17} /></div><strong>{loading ? "Syncing…" : formatCurrency(totalValue)}</strong><div><span className={portfolio ? "positive" : "positive"}><TrendingUp size={14} /> {portfolio ? "Live" : "+2.84%"}</span><small>{portfolio ? `${holdingCount} holdings · Kite` : "₹29,140 this month"}</small></div></article>
        <article className="metric"><div className="metric-label"><span>Available cash</span><WalletCards size={17} /></div><strong>{loading ? "Syncing…" : formatCurrency(availableCash)}</strong><div><span>{portfolio ? "Kite margin balance" : "32% of allocation"}</span><small>Capital limits still apply</small></div></article>
        <article className="metric"><div className="metric-label"><span>Unrealised P&L</span><TrendingUp size={17} /></div><strong className={totalPnl >= 0 ? "positive" : "negative"}>{loading ? "Syncing…" : `${totalPnl >= 0 ? "+" : ""}${formatCurrency(totalPnl)}`}</strong><div><span className={pnlPercent >= 0 ? "positive" : "negative"}>{pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%</span><small>Across {holdingCount} holdings</small></div></article>
        <article className="metric"><div className="metric-label"><span>Agent conviction</span><Sparkles size={17} /></div><strong>68<span>/100</span></strong><div><span>Moderately positive</span><small>6 agents reporting</small></div></article>
      </section>
      <section className="main-grid">
        <div className="main-column">
          <section className="panel agent-lab-cta"><div><span className="brand-mark"><Bot size={18} /></span><div><span className="eyebrow">Dedicated simulation workspace</span><h2>Agent trading lab</h2><p>Track the isolated {formatCurrency(botSleeve?.capital ?? capital)} NIFTY options sleeve, simulated GTT exits, research and feedback.</p></div></div><a href="/agent">Open agent lab <ExternalLink size={13} /></a></section>
          <section className="panel"><div className="panel-head"><div><span className="eyebrow">Ranked by conviction</span><h2>Investment opportunities</h2></div><button className="text-button">View all <ChevronDown size={14} /></button></div><div className="opportunity-list">{opportunities.map((_, index) => <OpportunityCard index={index} key={index} />)}</div></section>
        </div>
        <MarketRail />
      </section>
      <section className="panel news-panel"><div className="panel-head"><div><span className="eyebrow">India market intelligence</span><h2>News that may matter</h2></div><button className="refresh-button"><RefreshCw size={14} /> Refreshed 12 min ago</button></div><div className="news-grid">{news.slice(0, 3).map((item) => <article className="news-item" key={item.id}><div><span className={`impact impact-${item.impact.toLowerCase()}`}>{item.impact} impact</span><span>{item.category}</span></div><h3>{item.headline}</h3><p>{item.summary}</p><footer><span>{item.source} · {item.age}</span><div>{item.symbols.slice(0, 2).map((symbol) => <code key={symbol}>{symbol}</code>)}</div></footer></article>)}</div></section>
    </>
  );
}

function PortfolioView({ items, portfolio, loading, onRefresh }: { items: Holding[]; portfolio: LivePortfolio | null; loading: boolean; onRefresh: () => void }) {
  const total = portfolio?.totalValue ?? items.reduce((sum, item) => sum + item.quantity * item.ltp, 0);
  return <section className="page-view"><div className="page-title"><div><span className="eyebrow">{items.length} equity holdings · {portfolio ? "Live Kite data" : "Demo data"}</span><h1>Portfolio</h1><p>Existing holdings inform risk checks. Live holdings start protected and cannot be sold by agents.</p></div><div className="portfolio-title-actions"><div className="title-stat"><span>Current value</span><strong>{loading ? "Syncing…" : formatCurrency(total)}</strong></div><button className="button-secondary" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={14} /> Refresh</button></div></div><section className="panel table-panel"><div className="portfolio-table table-head"><span>Company</span><span>Quantity</span><span>Average</span><span>LTP</span><span>P&L</span><span>Agent access</span></div>{items.map((item) => { const pnl = item.pnl ?? item.quantity * (item.ltp - item.average); return <div className="portfolio-table" key={`${item.exchange}-${item.symbol}`}><div><span className="company-mark small-mark">{item.symbol.slice(0, 2)}</span><p><strong>{item.symbol}</strong><small>{item.exchange ?? item.company}</small></p></div><span>{item.quantity}</span><span>{formatCurrency(item.average)}</span><span>{formatCurrency(item.ltp)}</span><strong className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{formatCurrency(pnl)}</strong><span className={item.managed ? "managed" : "protected"}>{item.managed ? "Managed" : "Protected"}</span></div>})}</section></section>;
}

function NewsView() {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => { setRefreshing(true); window.setTimeout(() => setRefreshing(false), 900); };
  return <section className="page-view"><div className="page-title"><div><span className="eyebrow">Sources are timestamped</span><h1>Market news</h1><p>India-focused developments, deduplicated and ranked by potential portfolio impact.</p></div><button className="button-primary" onClick={refresh}><RefreshCw className={refreshing ? "spin" : ""} size={16} /> {refreshing ? "Refreshing…" : "Refresh now"}</button></div><div className="news-list">{news.map((item) => <article className="panel news-row" key={item.id}><div className="news-time"><Newspaper size={18} /><span>{item.age}</span></div><div><div className="news-meta"><span className={`impact impact-${item.impact.toLowerCase()}`}>{item.impact} impact</span><span>{item.category}</span><span>{item.source}</span></div><h2>{item.headline}</h2><p>{item.summary}</p><div className="symbol-list">{item.symbols.map((symbol) => <code key={symbol}>{symbol}</code>)}</div></div></article>)}</div></section>;
}

function SettingsView({ capital, onEdit }: { capital: number; onEdit: () => void }) {
  return <section className="page-view"><div className="page-title"><div><span className="eyebrow">Hard limits override every agent</span><h1>Risk & capital</h1><p>Isolated NIFTY long-option simulation policy. Live execution remains disabled.</p></div></div><div className="settings-grid"><section className="panel settings-card"><WalletCards size={21} /><div><span>Bot capital</span><strong>{formatCurrency(capital)}</strong><p>Maximum allocation, constrained by actual Kite cash.</p></div><button className="button-secondary" onClick={onEdit}>Edit</button></section>{[["Cash reserve", "20%", "Protected from new orders"], ["Position capital", "35% max", "One complete NIFTY option lot"], ["Premium at risk", "10% max", "Long options only"], ["Open positions", "1 max", "No overlapping option exposure"], ["Exit order", "OCO GTT", "Stop and target defined first"], ["Order mode", "Simulation", "Live execution disabled"]].map(([label, value, help]) => <section className="panel rule-card" key={label}><div><span>{label}</span><strong>{value}</strong><p>{help}</p></div><span className="rule-pass"><Check size={13} /> Active</span></section>)}</div></section>;
}

function GenericView({ view, research, researchRunning, researchError, onRunResearch }: { view: View; research: ResearchWorkflow | null; researchRunning: boolean; researchError: string; onRunResearch: () => void }) {
  if (view === "opportunities") return <section className="page-view"><div className="page-title"><div><span className="eyebrow">No pressure to trade</span><h1>Opportunities</h1><p>Candidates must pass research, portfolio fit and deterministic risk checks.</p></div></div><section className="panel"><div className="opportunity-list spacious">{opportunities.map((_, index) => <OpportunityCard index={index} key={index} />)}</div></section></section>;
  if (view === "agents") return <section className="page-view"><div className="page-title"><div><span className="eyebrow">Structured debate, auditable evidence</span><h1>Agent room</h1><p>Real workflow activity appears here as agents research, challenge and decide.</p></div></div><AgentRoom workflow={research} running={researchRunning} error={researchError} onRun={onRunResearch} /><div className="agent-directory">{agents.map(agent => <article className="panel agent-profile" key={agent.id}><span className="agent-avatar large" style={{ borderColor: agent.accent, color: agent.accent }}>{agent.name.charAt(0)}</span><div><strong>{agent.name}</strong><span>{agent.role}</span><p>{agent.task}</p></div><StatusDot status={agent.status} /></article>)}</div></section>;
  return <section className="page-view"><div className="page-title"><div><span className="eyebrow">Immutable activity journal</span><h1>Decisions</h1><p>Every recommendation, rejection and approval remains explainable.</p></div></div><section className="panel decisions-list">{decisions.map((decision, index) => <article key={index}><span className={`decision-icon decision-${decision.action.toLowerCase()}`}>{decision.action === "BUY" ? <TrendingUp size={17} /> : decision.action === "HOLD" ? <Pause size={17} /> : <X size={17} />}</span><div><span>{decision.time}</span><strong>{decision.symbol} · {decision.action}</strong><p>{decision.detail}</p></div><em>{decision.status}</em></article>)}</section></section>;
}

export default function Dashboard() {
  const router = useRouter();
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [capitalOpen, setCapitalOpen] = useState(false);
  const [capital, setCapital] = useState(1500000);
  const [paused, setPaused] = useState(false);
  const [kiteOpen, setKiteOpen] = useState(false);
  const [kiteState, setKiteState] = useState<KiteState>("checking");
  const [kiteConnecting, setKiteConnecting] = useState(false);
  const [kiteError, setKiteError] = useState("");
  const [portfolio, setPortfolio] = useState<LivePortfolio | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState("");
  const [botSleeve, setBotSleeve] = useState<BotSleeve | null>(null);
  const [research, setResearch] = useState<ResearchWorkflow | null>(null);
  const [researchRunning, setResearchRunning] = useState(false);
  const [researchError, setResearchError] = useState("");
  const title = useMemo(() => navItems.find((item) => item.id === view)?.label ?? "Overview", [view]);

  const loadPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    setPortfolioError("");
    try {
      const response = await fetch("/api/kite/portfolio", { cache: "no-store" });
      const data = await response.json() as LivePortfolio & { error?: string; requiresLogin?: boolean };
      if (!response.ok) {
        if (data.requiresLogin) setKiteState("disconnected");
        throw new Error(data.error ?? "Unable to synchronize the Kite portfolio.");
      }
      setPortfolio(data);
    } catch (error) {
      setPortfolioError(error instanceof Error ? error.message : "Unable to synchronize the Kite portfolio.");
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  const loadBotSleeve = useCallback(async () => {
    try {
      const response = await fetch("/api/bot/portfolio", { cache: "no-store" });
      if (response.ok) setBotSleeve(await response.json() as BotSleeve);
    } catch {
      // The personal portfolio remains usable if the local sleeve ledger is temporarily unavailable.
    }
  }, []);

  const checkKite = useCallback(async () => {
    setKiteState("checking");
    setKiteError("");
    try {
      const response = await fetch("/api/kite/status", { cache: "no-store" });
      const data = await response.json() as { authorized?: boolean };
      setKiteState(data.authorized ? "connected" : "disconnected");
      if (!data.authorized) setPortfolio(null);
    } catch {
      setKiteState("error");
      setKiteError("Could not reach the Kite connection service.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const initialize = async () => {
        const savedCapital = Number(window.localStorage.getItem("nivesh.botCapital"));
        if (Number.isFinite(savedCapital) && savedCapital >= 10000) {
          setCapital(savedCapital);
          await fetch("/api/settings", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ capital: savedCapital }),
          });
        } else {
          const response = await fetch("/api/settings", { cache: "no-store" });
          if (response.ok) {
            const settings = await response.json() as { capital: number };
            setCapital(settings.capital);
          }
        }
        await Promise.all([checkKite(), loadBotSleeve()]);
      };
      void initialize();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkKite, loadBotSleeve]);

  useEffect(() => {
    let active = true;
    void fetch("/api/agents/research", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: ResearchWorkflow | { result: null }) => {
        if (active && "mode" in data) setResearch(data);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!kiteOpen) return;
    const checkOnReturn = () => { void checkKite(); };
    window.addEventListener("focus", checkOnReturn);
    return () => window.removeEventListener("focus", checkOnReturn);
  }, [checkKite, kiteOpen]);

  useEffect(() => {
    if (kiteState !== "connected") return;
    const timer = window.setTimeout(() => { void loadPortfolio(); }, 0);
    return () => window.clearTimeout(timer);
  }, [kiteState, loadPortfolio]);

  const connectKite = async () => {
    setKiteConnecting(true);
    setKiteError("");
    const loginWindow = window.open("about:blank", "nivesh-kite-login");
    if (!loginWindow) {
      setKiteConnecting(false);
      setKiteState("error");
      setKiteError("Your browser blocked the Kite login tab. Allow pop-ups for localhost and try again.");
      return;
    }
    loginWindow.document.title = "Opening Kite…";
    loginWindow.document.body.textContent = "Preparing secure Kite authentication…";
    try {
      const response = await fetch("/api/kite/login", { method: "POST" });
      const data = await response.json() as { loginUrl?: string; error?: string };
      if (!response.ok || !data.loginUrl) throw new Error(data.error ?? "Kite login could not be started.");
      loginWindow.opener = null;
      loginWindow.location.href = data.loginUrl;
    } catch (error) {
      loginWindow?.close();
      setKiteError(error instanceof Error ? error.message : "Kite login could not be started.");
      setKiteState("error");
    } finally {
      setKiteConnecting(false);
    }
  };

  const runResearch = async () => {
    if (kiteState !== "connected") {
      setResearchError("Connect Kite before starting a portfolio-aware research run.");
      setKiteOpen(true);
      return;
    }
    setResearchRunning(true);
    setResearchError("");
    try {
      const response = await fetch("/api/agents/research", {
        method: "POST",
        headers: { "x-nivesh-action": "run-research" },
      });
      const data = await response.json() as ResearchWorkflow & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Pi research failed.");
      setResearch(data);
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : "Pi research failed. No action was taken.");
    } finally {
      setResearchRunning(false);
    }
  };

  const navigate = (next: View) => {
    if (next === "agents") {
      router.push("/agent");
      return;
    }
    setView(next);
    setSidebarOpen(false);
  };
  const saveCapital = (value: number) => {
    setCapital(value);
    window.localStorage.setItem("nivesh.botCapital", String(value));
    void fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capital: value }),
    }).then(() => loadBotSleeve());
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><span className="brand-mark"><TrendingUp size={19} /></span><div><strong>Nivesh</strong><small>Investment intelligence</small></div><button className="mobile-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <nav>{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "nav-active" : ""} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label}</span>{item.id === "agents" && <em>3</em>}</button>; })}</nav>
        <div className="sidebar-bottom"><button className="kite-status" onClick={() => setKiteOpen(true)}><span className="kite-logo">K</span><div><strong>{kiteState === "connected" ? "Kite connected" : kiteState === "checking" ? "Checking Kite…" : "Connect Kite"}</strong><small>{kiteState === "connected" ? "Authorized · Read-only" : "Authentication required"}</small></div>{kiteState === "checking" ? <LoaderCircle className="spin kite-spinner" size={14} /> : <span className={`connection-dot ${kiteState !== "connected" ? "connection-offline" : ""}`} />}</button><button className={`pause-button ${paused ? "paused" : ""}`} onClick={() => setPaused(!paused)}><Pause size={16} />{paused ? "Resume research" : "Pause all activity"}</button><div className="profile"><span>JK</span><div><strong>Jitesh</strong><small>Personal account</small></div><ChevronDown size={15} /></div></div>
      </aside>
      {sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
      <main className="workspace">
        <header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div className="mobile-title">{title}</div><div className="market-status"><span /> NSE open <small>Closes in 3h 18m</small></div><div className="top-actions"><label className="search-box"><Search size={16} /><input placeholder="Search stocks, news…" /></label><button className="icon-button notification"><Bell size={18} /><span /></button><span className="mode-pill">Simulation mode</span></div></header>
        {paused && <div className="paused-banner"><Pause size={15} /> All agent activity is paused. No research or proposals will run.<button onClick={() => setPaused(false)}>Resume</button></div>}
        <div className="content-area">
          {portfolioError && <div className="data-error"><span>{portfolioError}</span><button onClick={loadPortfolio}>Try again</button></div>}
          {view === "overview" && <Overview capital={capital} setCapitalOpen={setCapitalOpen} portfolio={portfolio} loading={portfolioLoading} botSleeve={botSleeve} />}
          {view === "portfolio" && <PortfolioView items={portfolio?.holdings ?? (kiteState === "connected" ? [] : mockHoldings)} portfolio={portfolio} loading={portfolioLoading} onRefresh={loadPortfolio} />}
          {view === "news" && <NewsView />}
          {view === "settings" && <SettingsView capital={capital} onEdit={() => setCapitalOpen(true)} />}
          {(view === "opportunities" || view === "agents" || view === "decisions") && <GenericView view={view} research={research} researchRunning={researchRunning} researchError={researchError} onRunResearch={runResearch} />}
        </div>
      </main>
      {capitalOpen && <CapitalDialog capital={capital} onSave={saveCapital} onClose={() => setCapitalOpen(false)} />}
      {kiteOpen && <KiteDialog state={kiteState} connecting={kiteConnecting} error={kiteError} onConnect={connectKite} onCheck={checkKite} onClose={() => setKiteOpen(false)} />}
    </div>
  );
}
