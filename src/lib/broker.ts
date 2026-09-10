export type BrokerMode = "mock" | "kite-readonly" | "kite-approval";

export type BrokerStatus = {
  provider: "kite";
  mode: BrokerMode;
  connected: boolean;
  canPlaceOrders: boolean;
  dataAsOf: string;
};

export interface BrokerAdapter {
  status(): Promise<BrokerStatus>;
  getHoldings(): Promise<unknown[]>;
  getAvailableCash(): Promise<number>;
}

class MockKiteAdapter implements BrokerAdapter {
  async status(): Promise<BrokerStatus> {
    return {
      provider: "kite",
      mode: "mock",
      connected: true,
      canPlaceOrders: false,
      dataAsOf: new Date().toISOString(),
    };
  }

  async getHoldings() {
    return [];
  }

  async getAvailableCash() {
    return 0;
  }
}

export function getBrokerAdapter(): BrokerAdapter {
  // A real Kite implementation will be injected here after OAuth/session handling,
  // encrypted credential storage, reconciliation, and approval gates are ready.
  return new MockKiteAdapter();
}
