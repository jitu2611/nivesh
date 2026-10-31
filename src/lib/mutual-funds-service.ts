import "server-only";
import { kiteMcp, resultData, resultText } from "./kite-mcp";
import { normalizeMutualFunds, type MutualFundPortfolio } from "./mutual-funds";
const runtime = globalThis as typeof globalThis & {
  niveshMutualFunds?: { at: number; snapshot: MutualFundPortfolio };
  niveshMutualFundsRun?: Promise<MutualFundPortfolio>;
};
export async function readMutualFunds(): Promise<MutualFundPortfolio> {
  if (runtime.niveshMutualFunds && Date.now() - runtime.niveshMutualFunds.at < 5 * 60000) return runtime.niveshMutualFunds.snapshot;
  if (runtime.niveshMutualFundsRun) return runtime.niveshMutualFundsRun;
  const run = (async () => {
    const result = await kiteMcp.callReadOnly("get_mf_holdings");
    if (result.isError) throw new Error(resultText(result) || "Kite mutual-fund holdings are unavailable.");
    const snapshot = normalizeMutualFunds(resultData(result));
    runtime.niveshMutualFunds = { at: Date.now(), snapshot };
    return snapshot;
  })();
  runtime.niveshMutualFundsRun = run;
  try { return await run; } finally { runtime.niveshMutualFundsRun = undefined; }
}
