import { describe, expect, it } from "vitest";
import { marketClock, planPaperEntry, validateInstrument } from "./paper-policy";

describe("marketClock", () => {
  it("uses Indian market hours regardless of the server timezone", () => {
    expect(marketClock(new Date("2026-09-14T03:45:00.000Z")).open).toBe(true);
    expect(marketClock(new Date("2026-09-14T09:56:00.000Z")).open).toBe(false);
  });

  it("rejects weekends", () => {
    expect(marketClock(new Date("2026-09-13T05:00:00.000Z")).open).toBe(false);
  });
});

describe("validateInstrument", () => {
  it("accepts exact NFO NIFTY calls and puts", () => {
    expect(validateInstrument("NFO:NIFTY26SEP24800CE", "long-option")).toEqual({
      exchange: "NFO",
      symbol: "NIFTY26SEP24800CE",
    });
  });

  it.each(["NSE:NIFTY", "NFO:BANKNIFTY26SEP50000CE", "NFO:NIFTY26SEP24800XX"])("rejects %s", (instrument) => {
    expect(() => validateInstrument(instrument, "long-option")).toThrow();
  });
});

describe("planPaperEntry", () => {
  const input = {
    strategy: "long-option" as const,
    livePrice: 100,
    stopLoss: 80,
    targetPrice: 130,
    capital: 100_000,
    cash: 100_000,
    cashReservePercent: 20,
    maxCapital: 35_000,
    lotSize: 75,
  };

  it("sizes only complete lots and includes costs", () => {
    const plan = planPaperEntry(input);
    expect(plan.quantity).toBe(75);
    expect(plan.fillPrice).toBeCloseTo(100.15);
    expect(plan.gross + plan.entryCharges).toBeLessThanOrEqual(plan.permittedCapital);
  });

  it("checks targets against the slipped fill", () => {
    expect(() => planPaperEntry({ ...input, targetPrice: 100.1 })).toThrow("target above the simulated fill");
  });

  it("rejects a contract when a complete lot cannot fit", () => {
    expect(() => planPaperEntry({ ...input, maxCapital: 5_000 })).toThrow("cannot fit");
  });
});
