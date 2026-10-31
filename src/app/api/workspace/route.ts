import { NextRequest, NextResponse } from "next/server";
import { authorizeMutation } from "@/lib/request-security";
import { workspaceTransaction, logEvent } from "@/lib/workspace-store";
import { analysisSymbols, parseAlgorithm } from "@/lib/workspace-policy";
import { analysePortfolio } from "@/lib/portfolio-analysis";
import { readPortfolio } from "@/lib/portfolio";
import { runAlgorithms } from "@/lib/algorithm-runner";
import { getRuntimeSettings } from "@/lib/runtime-store";
import { importBuyCsv, latestBuys } from "@/lib/buy-records";
import { syncLastBuys } from "@/lib/buy-sync";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET() {
  try { return NextResponse.json(await workspaceTransaction(s => s, false), { headers: { "cache-control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Workspace could not be read." }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  if (!authorizeMutation(request, "workspace")) return NextResponse.json({ error: "Unauthorized workspace request." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 520000) throw new Error("Request too large.");
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request.");
    const result = await workspaceTransaction(async state => {
      const settings = await getRuntimeSettings();
      switch (body.action) {
        case "create": {
          if (state.algorithms.length >= 20) throw new Error("At most 20 algorithms are supported.");
          const config = parseAlgorithm(body);
          if (state.algorithms.reduce((s, a) => s + a.budget, 0) + config.budget > settings.capital) throw new Error("Combined algorithm budgets exceed the configured paper capital.");
          state.algorithms.push({ ...config, id: crypto.randomUUID(), enabled: false, cash: config.budget, realisedPnl: 0, positions: [] });
          logEvent(state, "algorithm", `${config.name}: created, disabled by default`, "NIFTY/BANKNIFTY long-option paper sandbox, separate from the legacy agent-lab ledger. No broker order or real cash allocation.");
          break;
        }
        case "toggle": {
          const algo = state.algorithms.find(a => a.id === body.id);
          if (!algo) throw new Error("Algorithm not found.");
          if (algo.market !== "index-options") throw new Error("Legacy equity algorithms cannot be enabled. Create an index-option paper strategy.");
          algo.enabled = !algo.enabled;
          logEvent(state, "algorithm", `${algo.name}: ${algo.enabled ? "enabled" : "entries disabled; existing paper exits remain monitored"}`);
          break;
        }
        case "delete": {
          const algo = state.algorithms.find(a => a.id === body.id);
          if (!algo || algo.positions.length) throw new Error("Cannot delete an algorithm with open positions.");
          state.algorithms = state.algorithms.filter(a => a.id !== body.id);
          logEvent(state, "algorithm", `${algo.name}: deleted`);
          break;
        }
        case "sync-buys": {
          const previousSyncAt = state.buySyncAt;
          await syncLastBuys(state);
          if (state.buySyncAt !== previousSyncAt) logEvent(state, "analysis", state.buySyncError ? "Buy-fill sync unavailable" : "Today's executed delivery buys synced", state.buySyncError || "Historical buys need a Console tradebook CSV. Stored fills are not a guarantee of complete history.");
          break;
        }
        case "import-buys": {
          if (typeof body.csv !== "string") throw new Error("Choose a tradebook CSV.");
          const imported = importBuyCsv(body.csv, body.deliveryOnly === true);
          state.lastBuys = latestBuys(state.lastBuys || {}, imported.buys);
          logEvent(state, "analysis", `Imported ${imported.buys.length} equity BUY fills; skipped ${imported.skipped} other/invalid rows`, "Most recent executed fill per exchange/symbol retained. No average-cost substitution or brokerage actions.");
          break;
        }
        case "analyse": {
          if (settings.paused) throw new Error("Activity is paused.");
          const symbols = analysisSymbols(body.symbols);
          await syncLastBuys(state);
          state.analysis = await analysePortfolio(await readPortfolio(), symbols);
          logEvent(state, "analysis", `Portfolio analysis completed: ${state.analysis.rows.length} instruments`, state.analysis.methodology);
          break;
        }
        case "tick": {
          // Read-only fill capture continues when paper execution is paused or
          // there are no configured algorithms, including worker-only operation.
          await syncLastBuys(state);
          if (!settings.paused && state.algorithms.some(a => a.enabled || a.positions.length)) await runAlgorithms(state);
          break;
        }
        default: throw new Error("Unknown workspace action.");
      }
      return state;
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Workspace operation failed." }, { status: 400 }); }
}
