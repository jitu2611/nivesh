import "server-only";
import { marketClock } from "./paper-policy";
import { getRuntimeSettings } from "./runtime-store";
import { indiaDay, marketDataError } from "./historical-prices";
import { loadIndexBars, optionQuote, resolveOption } from "./index-options-data";
import { indexSignal, optionCharges, optionFill, optionSize, type IndexStrategy } from "./index-options-policy";
import { parseAlgorithm } from "./workspace-policy";
import { logEvent } from "./workspace-store";
import type { Algorithm, WorkspaceState } from "./workspace-types";
function value(algo: Algorithm) { return algo.cash + algo.positions.reduce((sum, p) => sum + p.quantity * p.mark, 0); }
function appendTrade(algo: Algorithm, trade: Omit<NonNullable<Algorithm["trades"]>[number], "id" | "at">) {
  algo.trades = [{ ...trade, id: crypto.randomUUID(), at: new Date().toISOString() }, ...(algo.trades || [])].slice(0, 500);
}
async function permitted() {
  if ((await getRuntimeSettings()).paused || !marketClock().open) throw new Error("Market session closed or paper execution paused.");
}
export async function runAlgorithms(state: WorkspaceState) {
  if ((await getRuntimeSettings()).paused) throw new Error("All paper execution is paused.");
  if (!marketClock().open) { logEvent(state, "algorithm", "Index-option cycle skipped: outside NSE session. No fills."); return; }
  for (const algo of state.algorithms) {
    if (algo.market !== "index-options") { algo.enabled = false; continue; }
    if (!algo.enabled && !algo.positions.length) continue;
    if (algo.lastRun && Date.now() - Date.parse(algo.lastRun) < 60000) continue;
    algo.lastRun = new Date().toISOString();
    try {
      parseAlgorithm(algo as unknown as Record<string, unknown>);
      const index = algo.index;
      if (index !== "NIFTY" && index !== "BANKNIFTY") throw new Error("Only NIFTY/BANKNIFTY index-option algorithms may run.");
      const today = indiaDay(new Date()), clock = marketClock();
      if (!Number.isFinite(algo.cash) || algo.cash < 0 || algo.positions.length > 1) throw new Error("Invalid paper ledger: cash must be nonnegative and only one option position is allowed per algorithm.");
      if (!algo.session || algo.session.day !== today) algo.session = { day: today, startValue: value(algo), entries: 0 };
      const hadPosition = algo.positions.length > 0;
      for (const position of [...algo.positions]) {
        await permitted();
        const contract = position.option;
        if (!contract || contract.index !== index || !position.instrument.startsWith(`NFO:${index}`) || !Number.isInteger(contract.lotSize) || contract.lotSize < 1 || position.quantity % contract.lotSize !== 0 || position.quantity <= 0) throw new Error("Stored position does not have validated index-option metadata and whole lots.");
        if (contract.expiry < today) throw new Error("Paper contract expired while offline; settlement is unresolved. Position retained, not assigned a fabricated exit price.");
        let quote = await optionQuote(position.instrument);
        position.mark = quote.bid; position.markAt = new Date().toISOString();
        const change = (position.mark / position.entry - 1) * 100;
        const timeExit = clock.minutes >= 15 * 60 + 15 || indiaDay(new Date(position.openedAt)) < today;
        let reason = change <= -algo.stopPercent ? "Premium stop-loss" : change >= algo.targetPercent ? "Premium target" : timeExit ? "15:15 time exit / overdue overnight position" : "";
        if (!reason) {
          // Premium protection and timed exits do not depend on indicator history.
          const signal = indexSignal(algo.strategy as IndexStrategy, await loadIndexBars(index));
          if (contract.type === "CE" ? signal.exitCall : signal.exitPut) {
            reason = `Underlying index reversal: ${signal.reason}`;
            quote = await optionQuote(position.instrument); // Revalidate executable depth after indicator I/O.
            position.mark = quote.bid; position.markAt = new Date().toISOString();
          }
        }
        if (!reason) continue;
        if (quote.bidUnits < position.quantity) throw new Error("Insufficient best-bid units for the full simulated option exit. Position retained.");
        await permitted();
        const fill = optionFill(quote.bid, contract.tickSize, "SELL"), gross = fill * position.quantity, charges = optionCharges(gross);
        const pnl = gross - charges - position.cost;
        algo.cash += gross - charges; algo.realisedPnl += pnl;
        algo.positions = algo.positions.filter(p => p !== position);
        appendTrade(algo, { side: "SELL", instrument: position.instrument, quantity: position.quantity, lots: position.quantity / contract.lotSize, price: fill, charges, pnl, reason });
        logEvent(state, "algorithm", `${algo.name}: PAPER SELL ${position.quantity} ${position.instrument} @ ${fill.toFixed(2)}`, `${reason}. Estimated fees ${charges.toFixed(2)}; realised P&L ${pnl.toFixed(2)}. No broker order.`);
      }
      if (hadPosition || algo.positions.length || !algo.enabled) continue;
      if (state.algorithms.reduce((sum, a) => sum + a.budget, 0) > (await getRuntimeSettings()).capital) throw new Error("Combined paper budgets exceed the configured capital limit.");
      if (clock.minutes >= 14 * 60 + 45) throw new Error("No new option entries after 14:45 IST; positions are due for exit at 15:15.");
      if (algo.session.entries >= (algo.maxTradesPerDay || 3)) throw new Error("Daily paper-entry limit reached.");
      if (value(algo) <= algo.session.startValue - algo.budget * 0.05) throw new Error("Daily loss guard reached (5% of algorithm budget); new entries paused for this session.");
      const signal = indexSignal(algo.strategy as IndexStrategy, await loadIndexBars(index));
      if (!signal.direction || signal.at <= (algo.lastSignalAt || 0)) { logEvent(state, "algorithm", `${algo.name}: no new index-option signal`, signal.reason); continue; }
      const contract = await resolveOption(index, signal.direction);
      const quote = await optionQuote(contract.instrument);
      await permitted();
      if (Date.now() - signal.at > 5 * 60000 || marketClock().minutes >= 14 * 60 + 45) throw new Error("Index signal became stale or entry cutoff passed during contract lookup.");
      const fill = optionFill(quote.ask, contract.tickSize, "BUY");
      const plan = optionSize(algo.budget, algo.cash, fill, contract, algo.maxLots || 1);
      if (quote.askUnits < plan.quantity) throw new Error("Insufficient best-ask units for the full simulated entry lot(s).");
      algo.cash -= plan.cost;
      algo.positions.push({ instrument: contract.instrument, quantity: plan.quantity, entry: fill, mark: quote.bid, cost: plan.cost, openedAt: new Date().toISOString(), markAt: new Date().toISOString(), option: { index, type: contract.type, expiry: contract.expiry, strike: contract.strike, lotSize: contract.lotSize, tickSize: contract.tickSize } });
      algo.lastSignalId = signal.id; algo.lastSignalAt = signal.at; algo.session.entries++;
      const reason = `${signal.reason} ATM ${contract.type}; expiry ${contract.expiry}; ${plan.lots} lot(s) × ${contract.lotSize} units. Estimated fees/slippage; full premium may be lost.`;
      appendTrade(algo, { side: "BUY", instrument: contract.instrument, quantity: plan.quantity, lots: plan.lots, price: fill, charges: plan.charges, reason });
      logEvent(state, "algorithm", `${algo.name}: PAPER BUY ${plan.quantity} ${contract.instrument} @ ${fill.toFixed(2)}`, reason);
    } catch (error) { logEvent(state, "algorithm", `${algo.name}: paper cycle skipped / incomplete`, marketDataError(error)); }
  }
}
