"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FlaskConical,
  IndianRupee,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { demoResearch, demoSleeve } from "@/lib/demo-data";
import type { BotSleeve, ResearchWorkflow } from "@/lib/types";

const formatCurrency = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format(value);

const agentRoster = [
  { name: "Scout", role: "Opportunity discovery", color: "#a78bfa" },
  { name: "Pulse", role: "News and catalysts", color: "#38bdf8" },
  { name: "Asha", role: "Bull case", color: "#34d399" },
  { name: "Virodh", role: "Bear case", color: "#fb7185" },
  { name: "Niti", role: "Portfolio decision", color: "#fbbf24" },
  { name: "Kavach", role: "Risk and policy", color: "#f97316" },
];

function EquityCurve({ sleeve }: { sleeve: BotSleeve }) {
  const data = sleeve.history.map((point) => ({
    time: new Date(point.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    value: point.value,
    capital: point.capital,
  }));

  return <div className="lab-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 14, right: 10, left: -12, bottom: 0 }}><defs><linearGradient id="labFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.24} /><stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} /><YAxis domain={["dataMin - 100", "dataMax + 100"]} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip contentStyle={{ background: "#121a1e", border: "1px solid #26343a", borderRadius: 9, fontSize: 11 }} formatter={(value) => formatCurrency(Number(value))} /><Area name="Agent portfolio" dataKey="value" type="monotone" stroke="#2dd4bf" strokeWidth={2.2} fill="url(#labFill)" dot={{ r: 2, fill: "#2dd4bf" }} /><Area name="Initial capital" dataKey="capital" type="monotone" stroke="#64748b" strokeDasharray="4 4" fill="transparent" dot={false} /></AreaChart></ResponsiveContainer></div>;
}

export default function AgentTradingDashboard() {
  const [sleeve, setSleeve] = useState<BotSleeve | null>(null);
  const [research, setResearch] = useState<ResearchWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [paperExecuting, setPaperExecuting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      setSleeve(demoSleeve);
      setResearch(demoResearch);
      setLoading(false);
      return;
    }
    try {
      const [sleeveResponse, researchResponse] = await Promise.all([
        fetch("/api/bot/portfolio", { cache: "no-store" }),
        fetch("/api/agents/research", { cache: "no-store" }),
      ]);
      if (!sleeveResponse.ok) throw new Error("Could not load the agent capital ledger.");
      setSleeve(await sleeveResponse.json() as BotSleeve);
      const report = await researchResponse.json() as ResearchWorkflow | { result: null };
      if ("mode" in report) setResearch(report);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load agent performance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const interval = window.setInterval(() => { void refresh(); }, 30_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [refresh]);

  const runResearch = async () => {
    setResearching(true);
    setError("");
    try {
      const response = await fetch("/api/agents/research", {
        method: "POST",
        headers: { "x-nivesh-action": "run-research" },
      });
      const result = await response.json() as ResearchWorkflow & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Research run failed.");
      setResearch(result);
      if (result.paperIntent) {
        setPaperExecuting(true);
        const paperResponse = await fetch("/api/agent/paper", {
          method: "POST",
          headers: { "x-nivesh-action": "execute-paper-intent" },
        });
        const paperResult = await paperResponse.json() as { error?: string };
        if (!paperResponse.ok) throw new Error(paperResult.error ?? "Paper execution evaluation failed.");
        await refresh();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Research run failed.");
    } finally {
      setResearching(false);
      setPaperExecuting(false);
    }
  };

  const exits = (sleeve?.trades ?? []).filter((trade) => trade.side === "SELL");
  const closedTrades = exits.length;
  const winRate = closedTrades ? exits.filter((trade) => (trade.realisedPnl ?? 0) > 0).length / closedTrades * 100 : 0;
  const returnClass = (sleeve?.pnl ?? 0) >= 0 ? "positive" : "negative";
  const lastVerdict = research?.verdict;
  const runningAgents = researching ? 4 : 0;
  const chartInsight = useMemo(() => sleeve?.positions.length ? `${sleeve.positions.length} positions are contributing to the marked portfolio value.` : "No trades yet. Performance remains equal to initial capital.", [sleeve]);

  if (loading || !sleeve) return <main className="agent-lab-loading"><LoaderCircle className="spin" size={25} /><span>Loading agent trading lab…</span></main>;

  return <div className="agent-lab-shell">
    <header className="lab-topbar">
      <div className="lab-brand"><Link href="/" aria-label="Back to Nivesh"><ArrowLeft size={18} /></Link><span className="brand-mark"><TrendingUp size={18} /></span><div><strong>Nivesh agent lab</strong><small>NIFTY options sandbox</small></div></div>
      <div className="lab-top-actions"><span className="mode-pill"><FlaskConical size={12} /> Simulation only</span><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh"><RefreshCw size={17} /></button><button className={`pause-button lab-pause ${paused ? "paused" : ""}`} onClick={() => setPaused(!paused)}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? "Resume agents" : "Pause agents"}</button></div>
    </header>

    <main className="lab-content">
      {paused && <div className="paused-banner lab-banner"><Pause size={14} /> Agent research and simulated execution are paused.</div>}
      {error && <div className="data-error"><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}
      <section className="lab-hero"><div><span className="eyebrow">NIFTY options · Paper trading</span><h1>Agent performance</h1><p>Track long NIFTY call and put decisions with a defined stop-loss and target through simulated two-leg GTT exits.</p></div><button className="button-primary lab-run" onClick={runResearch} disabled={researching || paperExecuting || paused}>{researching || paperExecuting ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{paperExecuting ? "Risk engine evaluating…" : researching ? "Agents researching…" : "Run research + paper cycle"}</button></section>

      <section className="lab-metrics">
        <article className="metric primary-metric"><div className="metric-label"><span>Agent portfolio value</span><Activity size={17} /></div><strong>{formatCurrency(sleeve.currentValue)}</strong><div><span className={returnClass}>{sleeve.returnPercent >= 0 ? "+" : ""}{sleeve.returnPercent.toFixed(2)}%</span><small>From {formatCurrency(sleeve.capital)} initial capital</small></div></article>
        <article className="metric"><div className="metric-label"><span>Available cash</span><WalletCards size={17} /></div><strong>{formatCurrency(sleeve.cash)}</strong><div><span>{Math.round(sleeve.cash / sleeve.capital * 100)}% unallocated</span><small>{formatCurrency(sleeve.invested)} invested</small></div></article>
        <article className="metric"><div className="metric-label"><span>Realised + unrealised P&L</span><IndianRupee size={17} /></div><strong className={returnClass}>{sleeve.pnl >= 0 ? "+" : ""}{formatCurrency(sleeve.pnl)}</strong><div><span>{closedTrades} closed trades</span><small>No fabricated outcomes</small></div></article>
        <article className="metric"><div className="metric-label"><span>Win rate</span><Target size={17} /></div><strong>{winRate.toFixed(0)}%</strong><div><span>Awaiting first closed trade</span><small>Minimum sample: 20 trades</small></div></article>
      </section>

      <section className="lab-grid">
        <div className="lab-main-column">
          <section className="panel lab-equity-panel"><div className="panel-head"><div><span className="eyebrow">Marked-to-market · Agent sleeve only</span><h2>Capital curve</h2></div><div className="chart-legend"><span><i className="portfolio-line" />Agent value</span><span><i className="nifty-line" />Initial capital</span></div></div><EquityCurve sleeve={sleeve} /><div className="lab-chart-note"><Activity size={14} /><span>{chartInsight}</span></div></section>

          <section className="panel"><div className="panel-head"><div><span className="eyebrow">Attributable to agent orders only</span><h2>Positions and trades</h2></div><span className="safe-label"><ShieldCheck size={13} /> Existing Kite holdings protected</span></div>{sleeve.positions.length === 0 ? <div className="lab-empty"><Clock3 size={22} /><strong>No simulated positions</strong><span>When an approved paper-trading proposal passes the risk engine, its position and live P&L will appear here.</span></div> : <div className="lab-position-list">{sleeve.positions.map((position) => <article key={position.symbol}><strong>{position.symbol}<small className="position-gtt">GTT: {position.exitPlan.lowerTrigger.toFixed(2)} / {position.exitPlan.upperTrigger.toFixed(2)}</small></strong><span>{position.quantity} units</span><span>{formatCurrency(position.value)}</span><em className={position.pnl >= 0 ? "positive" : "negative"}>{position.pnl >= 0 ? "+" : ""}{formatCurrency(position.pnl)}</em></article>)}</div>}</section>

          <section className="panel"><div className="panel-head"><div><span className="eyebrow">Latest pi workflow</span><h2>Research verdict</h2></div>{research?.candidate && <span className="ticker-pill">{research.candidate}</span>}</div>{lastVerdict ? <div className="lab-verdict"><span className={`report-stance stance-${lastVerdict.stance}`}>{lastVerdict.confidence}</span><div><strong>{lastVerdict.recommendation}</strong><p>{lastVerdict.summary}</p>{research?.paperIntent && <div className="paper-intent"><span>{research.paperIntent.action}</span><span>{research.paperIntent.strategy}</span><span>{research.paperIntent.instrument ?? "No instrument"}</span><span>{research.paperIntent.confidence}%</span></div>}<footer>{lastVerdict.sources.slice(0, 4).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={10} /></a>)}</footer></div></div> : <div className="lab-empty"><BrainCircuit size={22} /><strong>No research verdict yet</strong><span>Run market research to start a current, portfolio-aware pi workflow.</span></div>}</section>

          <section className="panel"><div className="panel-head"><div><span className="eyebrow">Risk-engine audit trail</span><h2>Paper activity</h2></div><span className="ticker-pill">{sleeve.decisions.length} decisions</span></div>{sleeve.decisions.length === 0 ? <div className="lab-empty compact-empty"><ShieldCheck size={22} /><strong>No paper decisions yet</strong><span>Every execution, rejection and no-action verdict will be recorded here.</span></div> : <div className="paper-activity">{sleeve.decisions.slice(0, 8).map((decision) => <article key={decision.id}><span className={`paper-status ${decision.status}`}>{decision.status}</span><div><strong>{decision.instrument ?? "No trade"} · {decision.strategy}</strong><p>{decision.message}</p></div><time>{new Date(decision.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></article>)}</div>}</section>
        </div>

        <aside className="lab-side-column">
          <section className="panel mandate-card"><div className="panel-head"><div><span className="eyebrow">Current mandate</span><h2>NIFTY options only</h2></div><FlaskConical size={17} /></div><div className="mandate-body"><div><CheckCircle2 size={14} /><span><strong>Long NIFTY CE or PE</strong><small>Exact NFO contract and full lot required</small></span></div><div><CheckCircle2 size={14} /><span><strong>Two-leg OCO GTT exit</strong><small>Stop-loss and target defined before entry</small></span></div><div><CheckCircle2 size={14} /><span><strong>One position maximum</strong><small>No writing, futures or other indices</small></span></div><div className="mandate-warning"><ShieldCheck size={15} /><p>This is a GTT simulation. Live NFO and GTT order tools remain blocked until a separate approval and reconciliation layer is tested.</p></div></div></section>

          <section className="panel leaderboard"><div className="panel-head"><div><span className="eyebrow">Outcome attribution</span><h2>Agent scoreboard</h2></div><span>{runningAgents} active</span></div>{agentRoster.map((agent) => <article key={agent.name}><span className="agent-avatar" style={{ borderColor: agent.color, color: agent.color }}>{agent.name.charAt(0)}</span><div><strong>{agent.name}</strong><small>{agent.role}</small></div><em>Unrated</em></article>)}<p>Scores activate only after enough decisions mature against their declared time horizons.</p></section>

          <section className="panel feedback-card"><div className="panel-head"><div><span className="eyebrow">Learning discipline</span><h2>Feedback loop</h2></div><BrainCircuit size={17} /></div><ol><li><span>1</span>Record prediction and horizon</li><li><span>2</span>Attribute research and sizing</li><li><span>3</span>Measure risk-adjusted outcome</li><li><span>4</span>Propose—not silently apply—changes</li></ol></section>
        </aside>
      </section>
    </main>
  </div>;
}
