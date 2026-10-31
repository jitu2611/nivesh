"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Upload } from "lucide-react";
import type { LivePortfolio } from "@/lib/types";
import type { PortfolioAnalysis, WorkspaceState } from "@/lib/workspace-types";
import { marketDataError } from "@/lib/historical-prices";
import { holdingVerdict, sinceLastBuy } from "@/lib/holding-verdict";
import CellPopover from "./cell-popover";
import { holdingSortOptions, nextHoldingSort, sortHoldingRows, type HoldingSort, type HoldingSortKey } from "@/lib/holding-sort";
const money = (v: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);
const change = (v?: number | null) => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v?: number | null) => v == null ? "nw-muted" : v >= 0 ? "nw-up" : "nw-down";
export default function HoldingsTable({ portfolio, analysis, workspace, connected, busy, onSync, onImport }: {
  portfolio: LivePortfolio | null; analysis?: PortfolioAnalysis; workspace: WorkspaceState; connected: boolean; busy: boolean;
  onSync: () => void; onImport: (csv: string) => Promise<void>;
}) {
  const [fileError, setFileError] = useState("");
  const [sort, setSort] = useState<HoldingSort>({ key: "stock", direction: "asc" });
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, []);
  const historyIsFresh = !!analysis && now !== null && now - Date.parse(analysis.asOf) < 24 * 3600000;
  const rows = sortHoldingRows((portfolio?.holdings || []).map(h => {
    const instrument = `${h.exchange || "NSE"}:${h.symbol}`;
    const row = analysis?.rows.find(r => r.instrument === instrument);
    const buy = workspace.lastBuys?.[instrument];
    const move = sinceLastBuy(h.ltp, buy);
    const allocation = historyIsFresh ? analysis?.suggestions.find(s => s.instrument === instrument) : undefined;
    const verdict = now !== null && portfolio && now - Date.parse(portfolio.asOf) > 24 * 3600000
      ? { label: "Refresh prices", tone: "neutral", reason: "The portfolio quote snapshot is older than 24 hours. Refresh before using a price-based verdict." }
      : holdingVerdict(h.ltp, buy, historyIsFresh ? row?.changes[1] : null, historyIsFresh ? row?.changes[7] : null);
    return { holding: h, instrument, row, changes: row?.changes, buy, move, allocation, verdict };
  }), sort);
  const sortHeader = (label: string, key: HoldingSortKey) => {
    const active = sort.key === key;
    const Icon = active ? sort.direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
    return <th aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button className={`nw-sort-header ${active ? "nw-sort-active" : ""}`} onClick={() => setSort(previous => nextHoldingSort(previous, key))} title={`Sort by ${holdingSortOptions.find(option => option.key === key)!.label}`} aria-label={`Sort by ${label}`}><span>{label}</span><Icon size={12} aria-hidden="true" /></button></th>;
  };
  const lastBuyKey: HoldingSortKey = sort.key.startsWith("buy-") ? sort.key : "buy-date";
  return <section className="nw-section"><div className="nw-section-head"><div><h2>Portfolio holdings</h2><p>New delivery buys sync every minute while open · hover or tap a cell for details</p></div><div className="nw-actions nw-holding-actions"><label className="nw-sort-control"><span>Sort by</span><select aria-label="Sort holdings by" value={sort.key} onChange={e => { const option = holdingSortOptions.find(option => option.key === e.target.value)!; setSort({ key: option.key, direction: option.direction }); }}>{holdingSortOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label><button aria-label={`Sort ${sort.direction === "asc" ? "descending" : "ascending"}`} title={sort.direction === "asc" ? "Ascending · click to reverse" : "Descending · click to reverse"} className="nw-icon" onClick={() => setSort(previous => ({ ...previous, direction: previous.direction === "asc" ? "desc" : "asc" }))}>{sort.direction === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}</button><button onClick={onSync} disabled={busy || !connected}><RefreshCw size={14} /> Retry buy sync</button><label className="nw-file-button"><Upload size={14} /> Import older buys<input type="file" aria-label="Import historical tradebook CSV" accept=".csv,text/csv" disabled={busy} onChange={async e => {
    const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (!file) return;
    if (file.size > 500000) { setFileError("Choose a CSV smaller than 500 KB."); return; }
    if (!window.confirm("Import actual delivery purchases only. If your Console CSV has no Product column, filter out intraday round trips first. Have you verified this file contains delivery purchases (or explicit CNC/MTF product tags)?")) return;
    setFileError(""); try { await onImport(await file.text()); } catch (error) { setFileError(error instanceof Error ? error.message : "Import failed."); }
  }} /></label></div></div>
    <div className="nw-table-wrap"><table className="nw-holdings-table"><thead><tr>{sortHeader("Stock", "stock")}{sortHeader("Quantity", "quantity")}{sortHeader("Price", "price")}{sortHeader("Value", "value")}{sortHeader("Unrealised P&L", "pnl")}{sortHeader("Last buy", lastBuyKey)}{sortHeader("1d", "1d")}{sortHeader("7d", "7d")}{sortHeader("30d", "30d")}{sortHeader("Verdict", "verdict")}</tr></thead><tbody>{rows.map(({ holding: h, instrument, row, buy, move, allocation, verdict }) => {
      return <tr key={instrument}>
        <td title={row?.error ? marketDataError(row.error) : undefined}><strong>{h.symbol}{row?.error ? " ·" : ""}</strong><small>{h.exchange || "NSE"}</small></td>
        <td>{h.quantity}</td><td>{money(h.ltp)}</td><td>{money(h.quantity * h.ltp)}</td><td className={tone(h.pnl ?? h.quantity * (h.ltp - h.average))}>{money(h.pnl ?? h.quantity * (h.ltp - h.average))}</td>
        <td className="nw-buy-cell"><CellPopover ariaLabel={`Last buy details for ${h.symbol}`} label={buy ? <span className="nw-buy-summary"><span><strong>{money(buy.price)}</strong><span className={tone(move?.percent)}>{change(move?.percent)}</span></span><small>{buy.quantity} units · {money(buy.price * buy.quantity)}</small></span> : <span className="nw-buy-summary"><span>Record required</span><small>Import older buys once</small></span>}>
          <h3>{h.symbol} · last recorded buy</h3>{buy ? <><dl><div><dt>Executed price / premium</dt><dd>{money(buy.price)}</dd></div><div><dt>Executed units</dt><dd>{buy.quantity}</dd></div><div><dt>Purchase amount</dt><dd>{money(buy.price * buy.quantity)} before fees</dd></div><div><dt>Change since this fill</dt><dd className={tone(move?.percent)}>{change(move?.percent)}{move ? ` · ${move.amount >= 0 ? "+" : ""}${money(move.amount)} / unit` : ""}</dd></div><div><dt>Executed at</dt><dd>{new Date(buy.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</dd></div><div><dt>Source / trade</dt><dd>{buy.source} · {buy.tradeId}</dd></div></dl><p>This fill’s units and amount—not your entire position or a proposed new allocation. Movement uses the current portfolio quote; not adjusted for corporate actions.</p></> : <p>Kite exposes today’s tradebook only. Import older delivery fills once; future observed fills are saved automatically. Holdings average cost is never substituted.</p>}
        </CellPopover></td>
        {([1, 7, 30] as const).map(p => <td key={p} className={tone(row?.changes[p])}>{change(row?.changes[p])}</td>)}
        <td className="nw-verdict-cell"><CellPopover ariaLabel={`Verdict details for ${h.symbol}`} className={verdict.tone === "up" ? "nw-up" : verdict.tone === "down" ? "nw-down" : "nw-muted"} label={verdict.label}>
          <h3>{h.symbol} · {verdict.label}</h3><p>{verdict.reason}</p>{allocation && <div className="nw-allocation-detail"><strong>Allocation illustration: {allocation.action}</strong><p>{allocation.quantity} shares · {money(allocation.amount)}</p><p>{allocation.reason}</p><small>Equal-weight illustration, not an order or a price-triggered recommendation.</small></div>}{analysis && <p>History as of {new Date(analysis.asOf).toLocaleString("en-IN")}{!historyIsFresh ? " · too old for daily/weekly verdict triggers" : ""}</p>}<p>Rule-based risk review only; no brokerage action.</p>
        </CellPopover></td>
      </tr>;
    })}</tbody></table>{!portfolio?.holdings.length && <div className="nw-empty">{connected ? "No equity holdings found." : "Connect Kite to load your portfolio."}</div>}</div>
    <p className="nw-footnote">Last buy groups the latest recorded fill’s price, executed units, amount and % change. Records survive sync failures. Polling captures new delivery fills while the app is open; keep the paper worker running for browser-independent capture. If neither runs during a trading day, that day’s fills need an import. Older records may be incomplete; split/bonus adjustments are not applied.</p>
    {workspace.buySyncAt && <p className="nw-footnote">Buy sync: {new Date(workspace.buySyncAt).toLocaleString("en-IN")}{workspace.buySyncError ? ` · ${marketDataError(workspace.buySyncError)} · saved records retained` : " · historical records retained; no prices inferred"}</p>}
    {fileError && <p role="alert" className="nw-footnote nw-down">{fileError}</p>}
  </section>;
}
