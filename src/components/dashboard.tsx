"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Check, ChevronDown, Download, LoaderCircle, Pause, Play, Plus, RefreshCw, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BotSleeve, LivePortfolio, ResearchWorkflow } from "@/lib/types";
import type { HealthPeriod, WorkspaceState } from "@/lib/workspace-types";
import { demoMutualFunds, demoPortfolio, demoResearch, demoSleeve } from "@/lib/demo-data";
import type { MutualFundPortfolio } from "@/lib/mutual-funds";
import { healthPeriodDescription, healthPeriodLabel, healthPeriods, marketDataError } from "@/lib/historical-prices";
import "./minimal-workspace.css";
import HoldingsTable from "./holdings-table";
import MutualFundsTable from "./mutual-funds-table";
import { algorithmPresets, strategyLabel, type Strategy } from "@/lib/algorithm-catalog";

const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const percent = (value: number | null | undefined) => value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const time = (value?: string) => value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not yet run";
const blank: WorkspaceState = { version: 1, algorithms: [], events: [] };
type Tab = "overview" | "agents" | "algorithms";
async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed. Please retry.");
  return data as T;
}
function Change({ value }: { value: number | null | undefined }) {
  return <span className={value == null ? "nw-muted" : value >= 0 ? "nw-up" : "nw-down"}>{percent(value)}</span>;
}
export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [portfolio, setPortfolio] = useState<LivePortfolio | null>(null);
  const [mutualFunds, setMutualFunds] = useState<MutualFundPortfolio | null>(null);
  const [mutualFundsError, setMutualFundsError] = useState("");
  const [mutualFundsLoading, setMutualFundsLoading] = useState(false);
  const [sleeve, setSleeve] = useState<BotSleeve | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState>(blank);
  const [research, setResearch] = useState<ResearchWorkflow | null>(null);
  const [connected, setConnected] = useState(false);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [capital, setCapital] = useState(1500000);
  const [period, setPeriod] = useState<HealthPeriod>(7);
  const [candidates, setCandidates] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [template, setTemplate] = useState<Strategy>("orb");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const running = useRef(false);
  const loadMutualFunds = useCallback(async () => {
    setMutualFundsLoading(true);
    setMutualFundsError("");
    try { setMutualFunds(await json<MutualFundPortfolio>("/api/kite/mutual-funds")); }
    catch (error) { setMutualFundsError(error instanceof Error ? error.message : "Mutual-fund sync unavailable."); }
    finally { setMutualFundsLoading(false); }
  }, []);
  const refresh = useCallback(async () => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      setDemo(true); setPortfolio(demoPortfolio); setMutualFunds(demoMutualFunds); setSleeve(demoSleeve); setResearch(demoResearch); setConnected(true); return;
    }
    const [state, settings, paper, latest] = await Promise.all([
      json<WorkspaceState>("/api/workspace"),
      json<{ capital: number; paused: boolean }>("/api/settings"),
      json<BotSleeve>("/api/bot/portfolio"),
      json<ResearchWorkflow | { result: null }>("/api/agents/research"),
    ]);
    setWorkspace(state); setPaused(settings.paused); setCapital(settings.capital); setSleeve(paper);
    if ("id" in latest) setResearch(latest);
    const status = await json<{ authorized: boolean }>("/api/kite/status");
    setConnected(status.authorized);
    if (status.authorized) {
      const [holdingsResult, buyResult] = await Promise.allSettled([
        json<LivePortfolio>("/api/kite/portfolio"),
        json<WorkspaceState>("/api/workspace", {
          method: "POST", headers: { "content-type": "application/json", "x-nivesh-action": "workspace" },
          body: JSON.stringify({ action: "sync-buys" }),
        }),
        loadMutualFunds(),
      ]);
      if (holdingsResult.status === "fulfilled") setPortfolio(holdingsResult.value);
      else setError("Portfolio refresh unavailable; showing the last snapshot.");
      if (buyResult.status === "fulfilled") setWorkspace(buyResult.value);
      else {
        // A portfolio lookup failure must not prevent independent fill capture.
        setWorkspace(previous => ({ ...previous, buySyncError: buyResult.reason instanceof Error ? buyResult.reason.message : "Buy-fill sync unavailable." }));
      }
    } else { setPortfolio(null); setMutualFunds(null); setMutualFundsError(""); }
  }, [loadMutualFunds]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh().catch(e => setError(e.message)); }, 0);
    const onFocus = () => { if (!running.current) void refresh().catch(e => setError(e.message)); };
    window.addEventListener("focus", onFocus);
    return () => { clearTimeout(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);
  useEffect(() => {
    if (!showForm && !settingsOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]') || []);
    const timer = window.setTimeout(() => { (dialog?.querySelector<HTMLElement>('input') || focusable()[0])?.focus(); }, 0);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setShowForm(false); setSettingsOpen(false); }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { clearTimeout(timer); document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [showForm, settingsOpen]);
  // One coordinated loop refreshes live holdings/buy fills and evaluates only
  // explicitly enabled paper rules. Separate loops could starve each other.
  useEffect(() => {
    if (demo || !connected) return;
    const interval = window.setInterval(async () => {
      if (running.current) return;
      running.current = true;
      try {
        if (!paused && workspace.algorithms.some(a => a.enabled || a.positions.length)) {
          setWorkspace(await json<WorkspaceState>("/api/workspace", { method: "POST", headers: { "content-type": "application/json", "x-nivesh-action": "workspace" }, body: JSON.stringify({ action: "tick" }) }));
        }
        await refresh();
      }
      catch (e) { setError(e instanceof Error ? e.message : "Portfolio sync or paper cycle failed."); }
      finally { running.current = false; }
    }, 60000);
    return () => clearInterval(interval);
  }, [connected, demo, paused, refresh, workspace.algorithms]);
  async function perform(label: string, operation: () => Promise<void>) {
    if (demo) { setError("Demo is read-only. Open / without ?demo=1 to make changes."); return; }
    if (running.current) return;
    running.current = true; setBusy(label); setError("");
    try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : "Operation failed."); }
    finally { running.current = false; setBusy(""); }
  }
  const mutate = async (body: Record<string, unknown>) => {
    setWorkspace(await json<WorkspaceState>("/api/workspace", { method: "POST", headers: { "content-type": "application/json", "x-nivesh-action": "workspace" }, body: JSON.stringify(body) }));
  };
  async function connect() {
    if (demo) return;
    const popup = window.open("about:blank", "nivesh-kite-login");
    if (!popup) { setError("Allow pop-ups to connect Kite."); return; }
    await perform("Connecting", async () => {
      try {
        const data = await json<{ loginUrl: string }>("/api/kite/login", { method: "POST", headers: { "x-nivesh-action": "kite-login" } });
        popup.opener = null; popup.location.href = data.loginUrl;
      } catch (e) { popup.close(); throw e; }
    });
  }
  const analysis = workspace.analysis;
  const health = analysis?.health?.[period];
  const healthPercent = health ? health.changePercent : typeof period === "number" ? analysis?.changes[period] : null;
  const algoValue = workspace.algorithms.reduce((sum, a) => sum + a.cash + a.positions.reduce((s, p) => s + p.quantity * p.mark, 0), 0);
  const algoCapital = workspace.algorithms.reduce((sum, a) => sum + a.budget, 0);
  const pnl = portfolio?.totalPnl ?? 0;
  const basis = (portfolio?.totalValue ?? 0) - pnl;
  const events = workspace.events.filter(e => (filter === "all" || e.category === filter) && `${e.message} ${e.details || ""}`.toLowerCase().includes(search.toLowerCase()));
  const exportLogs = () => {
    const blob = new Blob([JSON.stringify({ events: workspace.events, algorithms: workspace.algorithms, archivedAlgorithms: workspace.archivedAlgorithms, latestResearch: research, paperDecisions: sleeve?.decisions, paperTrades: sleeve?.trades }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "nivesh-activity.json"; a.click(); URL.revokeObjectURL(url);
  };
  return <div className="nw-shell">
    <header className="nw-header"><Link className="nw-brand" href="/">nivesh<span> / your investing workspace</span></Link><div className="nw-actions"><span className="nw-badge">{demo ? "Demo · fictional data" : "Paper execution only"}</span><button onClick={() => void connect()} disabled={!!busy} className="nw-connection"><i className={connected ? "connected" : ""} />{connected ? "Kite connected" : "Connect Kite"}</button><button className="nw-icon" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /></button></div></header>
    <div className="nw-body"><nav className="nw-tabs" aria-label="Workspace">{(["overview", "agents", "algorithms"] as Tab[]).map(t => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)} className={tab === t ? "selected" : ""}>{t.charAt(0).toUpperCase() + t.slice(1)}{t === "algorithms" && workspace.algorithms.length > 0 && <span>{workspace.algorithms.length}</span>}</button>)}</nav>
      {error && <div role="alert" className="nw-alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={15} /></button></div>}
      {paused && <div className="nw-note">All research and paper execution are paused. Resume in settings.</div>}
      {tab === "overview" && <>
        <div className="nw-title"><div><div className="nw-kicker">Your money, at a glance</div><h1>Portfolio & performance</h1><p>{portfolio ? `Kite equity holdings · synced ${time(portfolio.asOf)}` : "Connect Kite to see your holdings. Your existing investments stay protected."}</p></div><button disabled={!!busy} onClick={() => void perform("Refreshing", refresh)}><RefreshCw size={15} className={busy === "Refreshing" ? "spin" : ""} /> Refresh</button></div>
        <section className="nw-metrics">
          <div><span>Equity holdings value</span><strong>{portfolio ? money(portfolio.totalValue) : "—"}</strong><small>{portfolio?.holdings.length ?? 0} holdings</small></div>
          <div><span>Unrealised return</span><strong className={pnl >= 0 ? "nw-up" : "nw-down"}>{portfolio ? money(pnl) : "—"}</strong><small><Change value={portfolio && basis > 0 ? pnl / basis * 100 : null} /> since purchase</small></div>
          <div><span>Available cash</span><strong>{portfolio ? money(portfolio.availableCash) : "—"}</strong><small>Broker margin balance</small></div>
          <div><span>Algorithm paper P&L</span><strong className={algoValue - algoCapital >= 0 ? "nw-up" : "nw-down"}>{money(algoValue - algoCapital)}</strong><small>Simulated index-option budgets</small></div>
        </section>
        <section className="nw-section"><div className="nw-section-head"><div><h2>Portfolio health</h2><p>Current equity holdings · price-only comparison, not actual account profit</p></div><div className="nw-periods" role="group" aria-label="Portfolio health period">{healthPeriods.map(p => <button className={period === p ? "selected" : ""} key={p} aria-label={`${healthPeriodDescription(p)} portfolio health`} aria-pressed={period === p} onClick={() => setPeriod(p)}>{healthPeriodLabel(p)}</button>)}</div></div>
          <div className="nw-health"><div><span>{healthPeriodDescription(period)} equity price movement</span><strong><Change value={healthPercent} /></strong><span className={health?.changeAmount == null ? "nw-muted" : health.changeAmount >= 0 ? "nw-up" : "nw-down"}>{health?.changeAmount == null ? health ? "Value change unavailable for this period" : "Analyse portfolio to calculate ₹ value change" : `${health.changeAmount >= 0 ? "+" : ""}${money(health.changeAmount)} hypothetical value change`}</span><small>{health ? `${health.covered}/${health.total} equity holdings covered · baseline on/before ${health.targetDate}` : "Today's quantities held constant · cash and mutual funds excluded"}</small></div><div><span>Add candidates to compare <small>(optional)</small></span><input aria-label="Candidate symbols" placeholder="NSE:INFY, NSE:TCS" value={candidates} onChange={e => setCandidates(e.target.value)} /><small>Included in illustrative allocation suggestions</small></div><button className="nw-primary" disabled={!!busy || paused || !connected} onClick={() => void perform("Analysing", () => mutate({ action: "analyse", symbols: candidates }))}>{busy === "Analysing" ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{busy === "Analysing" ? "Analysing…" : "Analyse portfolio"}</button></div>
          {analysis && <details className="nw-report"><summary><span>Calculation & scope · analysed {time(analysis.asOf)}</span><ChevronDown size={14} /></summary><p>{analysis.methodology}</p><p>Six-month and one-year comparisons are top-level only; holdings and mutual-fund table columns are unchanged. Actual historical account profit needs complete purchases, sales and cash flows; mutual-fund NAV history is not supplied by the current holdings endpoint.</p></details>}
          {typeof period === "string" && analysis && !health && <p className="nw-footnote" role="status">This saved analysis does not include {healthPeriodLabel(period)} history. Click Analyse portfolio once to fetch the longer lookback.</p>}
          {health && health.covered < health.total && <p className="nw-footnote" role="status">Incomplete {healthPeriodLabel(period)} coverage: {health.covered} of {health.total} current equity holdings have both a valid quote and a usable baseline. The portfolio change stays unavailable rather than reporting a partial total. New listings, suspended instruments or missing data may lack history.</p>}
          {analysis?.rows.some(row => row.error || Object.values(row.changes).every(value => value === null)) && <details className="nw-report"><summary><span className="nw-down">Some historical comparisons are unavailable</span><ChevronDown size={14} /></summary><p>Kite supports history. Missing values below indicate a request, authorization or data-format problem—not a zero return.</p><ul>{analysis.rows.filter(row => row.error || Object.values(row.changes).every(value => value === null)).map(row => <li key={row.instrument}>{row.instrument}: {row.error ? marketDataError(row.error) : "Short-term comparisons are unavailable for this row. Check the selected period's coverage or click Analyse portfolio to fetch history again."}</li>)}</ul></details>}
        </section>
        <HoldingsTable portfolio={portfolio} analysis={analysis} workspace={workspace} connected={connected} busy={!!busy} onSync={() => void perform("Syncing buys", () => mutate({ action: "sync-buys" }))} onImport={csv => perform("Importing buys", () => mutate({ action: "import-buys", csv, deliveryOnly: true }))} />
        <MutualFundsTable snapshot={mutualFunds} error={mutualFundsError} loading={mutualFundsLoading} connected={connected} onRefresh={() => void perform("Refreshing mutual funds", loadMutualFunds)} />
        <section className="nw-section"><div className="nw-section-head"><div><h2>NIFTY options paper performance</h2><p>Separate legacy simulation · not live holdings or the configurable index-option algorithms</p></div><span className={(sleeve?.pnl ?? 0) >= 0 ? "nw-up" : "nw-down"}>{money(sleeve?.pnl ?? 0)} · {percent(sleeve?.returnPercent)}</span></div>{sleeve && sleeve.history.length > 1 ? <div className="nw-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={sleeve.history}><XAxis dataKey="timestamp" tickFormatter={v => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} minTickGap={70} axisLine={false} tickLine={false} /><YAxis domain={["auto", "auto"]} hide /><Tooltip labelFormatter={v => time(String(v))} formatter={v => money(Number(v))} contentStyle={{ background: "#171c1a", border: "1px solid #343b37" }} /><Line name="Paper value" type="linear" dataKey="value" stroke="#8fc7ab" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div> : <p className="nw-empty">Performance history will appear after paper activity.</p>}</section>
      </>}
      {tab === "agents" && <>
        <div className="nw-title"><div><div className="nw-kicker">One place for every decision</div><h1>Agents & activity</h1><p>Research reports, analysis and paper decisions. Persistent local audit history.</p></div><button className="nw-primary" disabled={!!busy || paused || !connected} onClick={() => void perform("Researching", async () => { setResearch(await json<ResearchWorkflow>("/api/agents/research", { method: "POST", headers: { "x-nivesh-action": "run-research" } })); await refresh(); })}>{busy === "Researching" ? <LoaderCircle size={16} className="spin" /> : <Bot size={16} />}{busy === "Researching" ? "Agents researching…" : "Run research"}</button></div>
        <section className="nw-section"><div className="nw-section-head"><h2>Latest research</h2><span className="nw-muted">Research only · no orders</span></div>{research ? <><div className="nw-verdict"><Sparkles size={20} /><div><strong>{research.verdict.recommendation}</strong><p>{research.verdict.summary}</p><small>{time(research.completedAt)} · {research.verdict.confidence}% confidence</small></div></div>{research.reports.map((r, i) => <details className="nw-report" key={`${r.agent}-${i}`}><summary><span>{r.agent}<small>{r.symbol || research.candidate || "Portfolio"}</small></span><span>{r.stance} · {r.confidence}% <ChevronDown size={14} /></span></summary><p>{r.summary}</p><ul>{r.arguments.map((a, n) => <li key={n}>{a}</li>)}</ul>{r.risks.length > 0 && <p>Risks: {r.risks.join(" · ")}</p>}<p>{r.recommendation}</p><div className="nw-links">{r.sources.map((s, n) => /^https?:\/\//.test(s.url) ? <a key={n} href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a> : null)}</div></details>)}</> : <p className="nw-empty">No research yet. Run agents to collect fresh evidence and a portfolio verdict.</p>}</section>
        <section className="nw-section"><div className="nw-section-head"><h2>Activity log</h2><button onClick={exportLogs}><Download size={14} /> Export JSON</button></div><div className="nw-log-tools"><select aria-label="Log category" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All activity</option><option value="analysis">Portfolio analysis</option><option value="research">Research</option><option value="algorithm">Algorithms</option></select><input aria-label="Search logs" placeholder="Search activity…" value={search} onChange={e => setSearch(e.target.value)} /></div>{events.length ? events.slice(0, 100).map(e => <details key={e.id} className="nw-event"><summary><time>{time(e.at)}</time><span>{e.message}</span><span className="nw-badge">{e.category}</span></summary>{e.details && <pre>{e.details}</pre>}</details>) : <p className="nw-empty">No matching activity. Completed runs and configuration changes will appear here.</p>}<p className="nw-footnote">Latest 1,000 workspace events retained; latest 100 matches shown. Exports include paper decisions and trades. Reports are completed-run records, not a stream of internal agent reasoning.</p></section>
        {!!sleeve?.decisions.length && <section className="nw-section"><div className="nw-section-head"><h2>NIFTY paper decisions</h2><a href="/agent">Detailed options lab ↗</a></div>{sleeve.decisions.slice(-20).reverse().map(d => <div className="nw-event nw-paper-event" key={d.id}><time>{time(d.createdAt)}</time><span>{d.instrument || "No trade"} · {d.message}</span><span className="nw-badge">{d.status}</span></div>)}</section>}
      </>}
      {tab === "algorithms" && <>
        <div className="nw-title"><div><div className="nw-kicker">Your rules, consistently applied</div><h1>Algorithms</h1><p>NIFTY / BANKNIFTY options only. Long Calls or Puts. Isolated paper budgets.</p></div><button className="nw-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Add algorithm</button></div>
        <div className="nw-note">Enabled strategies run every minute while this workspace is open. For operation with the browser closed, run <code>npm run paper:worker</code> alongside Nivesh. Entries run only during the NSE session with fresh quotes. No live trading. Stops are simulated and not guaranteed fills.</div>
        <section className="nw-section"><div className="nw-section-head"><div><h2>Strategy library</h2><p>Well-known ideas, explicit rules. No promised returns, backtest claims or automatic live deployment.</p></div></div><div className="nw-preset-grid">{algorithmPresets.map(p => <article key={p.strategy} className="nw-preset"><span className="nw-kicker">{p.category}</span><h3>{p.name}</h3><p>{p.entry}</p><details><summary>Rules, data & risks</summary><p>{p.exit}</p><p>Needs: {p.history}. Signals use completed 5-minute INDEX candles. Entries fill at a fresh option ask plus estimated slippage, not at the index price.</p><p>{p.risk}</p><a href={p.source} target="_blank" rel="noreferrer">Indicator reference ↗</a></details><button disabled={!!busy} onClick={() => { setTemplate(p.strategy); setShowForm(true); }}><Plus size={14} /> Use preset</button></article>)}</div><p className="nw-footnote">Buy-only CE/PE paper positions, never option writing. Select the nearest listed expiry after today and its closest ATM strike. Lot size comes from current contract metadata; one full lot must fit the 10% premium-at-risk cap and 20% reserve. No new entries after 14:45; exits due 15:15 IST. Stops are simulated, not guaranteed.</p></section>
        <div className="nw-section-head nw-algo-toolbar"><span className="nw-muted">{workspace.algorithms.filter(a => a.enabled).length} enabled · {money(algoCapital)} allocated of {money(capital)} paper limit</span><button disabled={!!busy || paused} onClick={() => void perform("Running cycle", () => mutate({ action: "tick" }))}><RefreshCw size={14} className={busy === "Running cycle" ? "spin" : ""} /> Run paper cycle</button></div>
        {!workspace.algorithms.length && <section className="nw-section nw-empty"><Bot size={28} /><h2>Start with a simple rule</h2><p>Choose NIFTY or BANKNIFTY, an index signal, paper budget and premium stop/target.<br />New algorithms start disabled. You decide when they run.</p><button onClick={() => setShowForm(true)}>Create your first algorithm</button></section>}
        {!!workspace.archivedAlgorithms?.length && <details className="nw-section nw-report"><summary>{workspace.archivedAlgorithms.length} legacy equity configurations archived · execution disabled</summary><p>The previous stock strategies were not converted into options or liquidated. Their simulated balances and positions are retained for audit only and are excluded from current option budgets/performance.</p>{workspace.archivedAlgorithms.map(a => <div className="nw-position" key={a.id}><span>{a.name}<small>{a.positions.length} archived simulated positions · {strategyLabel(a.strategy)}</small></span><span>{money(a.cash + a.positions.reduce((sum, p) => sum + p.quantity * p.mark, 0))}<small>Frozen historical value</small></span></div>)}</details>}
        <div className="nw-algo-grid">{workspace.algorithms.map(a => { const value = a.cash + a.positions.reduce((s, p) => s + p.quantity * p.mark, 0); return <article key={a.id} className="nw-section nw-algo"><div className="nw-section-head"><h2>{a.name}</h2><span className="nw-badge">{a.enabled ? "Enabled · paper" : "Entries off"}</span></div><p>{strategyLabel(a.strategy)} · completed 5-minute index candles</p><div className="nw-symbols">{a.index} · ATM CE/PE · nearest expiry after today · ≤{a.maxLots || 1} lot(s)</div><div className="nw-algo-stats"><div><span>Paper value</span><strong>{money(value)}</strong></div><div><span>Paper P&L</span><strong className={value - a.budget >= 0 ? "nw-up" : "nw-down"}>{money(value - a.budget)}</strong></div><div><span>Budget / cash</span><strong>{money(a.budget)} / {money(a.cash)}</strong></div></div><p className="nw-muted">Premium stop {a.stopPercent}% · target {a.targetPercent}% · 20% reserve · 10% premium cap · max {a.maxTradesPerDay || 3} entries/day</p>{a.positions.map(p => <div className="nw-position" key={p.instrument}><span>{p.instrument}<small>{p.option ? `${p.quantity / p.option.lotSize} lot(s) × ${p.option.lotSize} units · ${p.option.type} · expiry ${p.option.expiry}` : `${p.quantity} units`} @ {money(p.entry)} premium · marked {time(p.markAt)}</small></span><span className={p.mark * p.quantity - p.cost >= 0 ? "nw-up" : "nw-down"}>{money(p.mark * p.quantity - p.cost)}</span></div>)}{!!a.trades?.length && <details className="nw-algo-trades"><summary>{a.trades.length} paper trades · recent fills</summary>{a.trades.slice(0, 10).map(t => <div className="nw-position" key={t.id}><span>{t.side} · {t.instrument}<small>{time(t.at)} · {t.lots} lot(s) / {t.quantity} units · {t.reason}</small></span><span>{money(t.price)}<small>Fees {money(t.charges)}{t.pnl !== undefined ? ` · P&L ${money(t.pnl)}` : ""}</small></span></div>)}</details>}<footer><small>Last cycle {time(a.lastRun)}. Marks are option bid estimates, updated only on cycles.</small><div className="nw-actions"><button disabled={!!busy} onClick={() => void perform("Updating algorithm", () => mutate({ action: "toggle", id: a.id }))}>{a.enabled ? <Pause size={14} /> : <Play size={14} />}{a.enabled ? "Disable entries" : "Enable"}</button><button className="nw-icon" aria-label={`Delete ${a.name}`} disabled={!!busy || a.positions.length > 0} onClick={() => { if (window.confirm(`Delete ${a.name}? Its closed-trade summary will no longer appear in performance.`)) void perform("Deleting", () => mutate({ action: "delete", id: a.id })); }}><Trash2 size={15} /></button></div></footer></article>; })}</div>
      </>}
      <footer className="nw-bottom"><span>Local-first. Your live holdings stay yours.</span><span>Research ≠ advice. Paper fills ≠ real execution.</span></footer>
    </div>
    {showForm && <AlgorithmForm key={template} initialStrategy={template} error={error} busy={!!busy} onClose={() => setShowForm(false)} onSave={data => perform("Saving algorithm", async () => { await mutate({ action: "create", ...data }); setShowForm(false); })} />}
    {settingsOpen && <div className="nw-overlay"><section className="nw-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="nw-section-head"><h2 id="settings-title">Workspace settings</h2><button aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div>{error && <p role="alert" className="nw-down">{error}</p>}<form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); const next = Number(data.get("capital")); if (next < algoCapital) { setError("Capital cannot be less than allocated algorithm budgets."); return; } void perform("Saving settings", async () => { const settings = await json<{ capital: number; paused: boolean }>("/api/settings", { method: "POST", headers: { "content-type": "application/json", "x-nivesh-action": "update-settings" }, body: JSON.stringify({ capital: next, paused: data.get("paused") === "on" }) }); setCapital(settings.capital); setPaused(settings.paused); setSettingsOpen(false); }); }}><label>Paper capital limit<input name="capital" type="number" min={Math.max(10000, algoCapital)} max="100000000" defaultValue={capital} required /></label><label className="nw-checkbox"><input name="paused" type="checkbox" defaultChecked={paused} /> Pause all research and paper cycles</label><p>Capital is a simulation limit, not a transfer. Index-option algorithms and the legacy NIFTY ledger are separate simulations and must not be added together as a single funded account.</p><button disabled={!!busy} type="submit" className="nw-primary"><Check size={15} /> Save settings</button></form></section></div>}
  </div>;
}
function AlgorithmForm({ onClose, onSave, busy, error, initialStrategy }: { onClose: () => void; onSave: (data: Record<string, unknown>) => Promise<void>; busy: boolean; error: string; initialStrategy: Strategy }) {
  const [strategy, setStrategy] = useState<Strategy>(initialStrategy);
  const preset = algorithmPresets.find(p => p.strategy === strategy);
  return <div className="nw-overlay"><section className="nw-modal" role="dialog" aria-modal="true" aria-labelledby="algo-title"><div className="nw-section-head"><div><div className="nw-kicker">NIFTY / BANKNIFTY options · paper only</div><h2 id="algo-title">New algorithm</h2></div><button onClick={onClose} aria-label="Close algorithm form"><X size={18} /></button></div>{error && <p role="alert" className="nw-down">{error}</p>}<form onSubmit={e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); void onSave(data); }}><input type="hidden" name="market" value="index-options" /><label>Name<input autoFocus name="name" maxLength={80} defaultValue={preset?.name} placeholder="My NIFTY opening range" required /></label><div className="nw-form-grid"><label>Underlying index<select name="index" aria-label="Underlying index" defaultValue="NIFTY"><option value="NIFTY">NIFTY 50</option><option value="BANKNIFTY">BANKNIFTY</option></select></label><label>Rule<select name="strategy" aria-label="Index option strategy" value={strategy} onChange={e => setStrategy(e.target.value as Strategy)}>{algorithmPresets.map(p => <option key={p.strategy} value={p.strategy}>{p.name}</option>)}</select></label></div>{preset && <div className="nw-note"><strong>{preset.name}</strong><p>{preset.entry}</p><p>{preset.exit}</p><p>Data: {preset.history}. Indicator periods are fixed for this preset.</p></div>}<div className="nw-form-grid"><label>Maximum lots per entry<input name="maxLots" type="number" min="1" max="10" step="1" defaultValue="1" required /></label><label>Maximum entries per day<input name="maxTradesPerDay" type="number" min="1" max="10" step="1" defaultValue="3" required /></label><label>Paper budget (₹)<input name="budget" type="number" min="10000" max="10000000" defaultValue="250000" required /></label><label>Premium stop-loss (%)<input key={`stop-${strategy}`} name="stopPercent" type="number" min="0.5" max="50" step="0.5" defaultValue={preset?.stop || 5} required /></label><label>Premium profit target (%)<input key={`target-${strategy}`} name="targetPercent" type="number" min="0.5" max="200" step="0.5" defaultValue={preset?.target || 10} required /></label></div><p>Automatic ATM CE on bullish signals / ATM PE on bearish signals. Exact NFO contract, dynamic full-lot sizing and fresh bid/ask depth required. 10% maximum premium at risk, 20% reserve, 5% daily loss guard. Whole lots that do not fit are skipped. No expiry-day entries. Timed exit at 15:15 needs the app/worker running; no guaranteed stop or fill.</p><button className="nw-primary" disabled={busy} type="submit">{busy ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} Create disabled algorithm</button></form></section></div>;
}
