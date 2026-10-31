import "server-only";
import { kiteMcp, resultData, resultText } from "./kite-mcp";
import { latestBuys, normalizeBuy } from "./buy-records";
import { marketDataError } from "./historical-prices";
import type { LastBuy, WorkspaceState } from "./workspace-types";
export async function syncLastBuys(state: WorkspaceState) {
  if (state.buySyncAt && Date.now() - Date.parse(state.buySyncAt) < 60000) return;
  try {
    const result = await kiteMcp.callReadOnly("get_trades");
    if (result.isError) throw new Error(resultText(result));
    let data = resultData(result);
    for (let i = 0; i < 8 && data && typeof data === "object" && !Array.isArray(data); i++) {
      const r = data as Record<string, unknown>;
      if (r.trades !== undefined) { data = r.trades; break; }
      if (r.data !== undefined) data = r.data; else if (r.result !== undefined) data = r.result; else break;
    }
    if (!Array.isArray(data)) throw new Error("Kite returned an unsupported tradebook format.");
    const buys = data.map(row => normalizeBuy(row, "kite-tradebook")).filter((buy): buy is LastBuy => !!buy);
    state.lastBuys = latestBuys(state.lastBuys || {}, buys);
    state.buySyncError = undefined;
  } catch (error) { state.buySyncError = marketDataError(error); }
  state.buySyncAt = new Date().toISOString();
}
