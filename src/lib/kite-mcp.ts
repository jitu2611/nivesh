import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";

const KITE_MCP_ENDPOINT = "https://mcp.kite.trade/mcp";
const EXECUTION_TOOLS = new Set(["place_order", "place_gtt_order", "cancel_order", "delete_gtt_order"]);

const READ_ONLY_TOOLS = new Set([
  "login",
  "get_profile",
  "get_holdings",
  "get_positions",
  "get_margins",
  "get_orders",
  "get_order_history",
  "get_order_trades",
  "get_trades",
  "get_gtts",
  "get_mf_holdings",
  "get_ltp",
  "get_ohlc",
  "get_quotes",
  "get_historical_data",
  "search_instruments",
]);

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

export type McpResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
  structuredContent?: unknown;
  [key: string]: unknown;
};

class KiteMcpClient {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private connecting?: Promise<void>;

  async connect() {
    if (this.child?.stdin.writable) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.start();
    try {
      await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async start() {
    const proxy = join(process.cwd(), "node_modules", "mcp-remote", "dist", "proxy.js");
    this.child = spawn(process.execPath, [proxy, KITE_MCP_ENDPOINT], {
      cwd: process.cwd(),
      env: { ...process.env, NO_BROWSER: "true" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.receive(chunk.toString()));
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", () => this.fail(new Error("Kite MCP connection closed.")));

    await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "nivesh", version: "0.1.0" },
    });
    this.notify("notifications/initialized", {});
  }

  async callReadOnly(tool: string, args: Record<string, unknown> = {}): Promise<McpResult> {
    if (!READ_ONLY_TOOLS.has(tool)) throw new Error(`Kite tool '${tool}' is not permitted by the read-only policy.`);
    await this.connect();
    return this.request("tools/call", { name: tool, arguments: args }) as Promise<McpResult>;
  }

  async callExecution(tool: string, args: Record<string, unknown>): Promise<McpResult> {
    if (process.env.NIVESH_LIVE_TRADING_ENABLED !== "true") throw new Error("Live trading is disabled by the server kill switch.");
    if (!EXECUTION_TOOLS.has(tool)) throw new Error(`Kite execution tool '${tool}' is not permitted.`);
    await this.connect();
    return this.request("tools/call", { name: tool, arguments: args }) as Promise<McpResult>;
  }

  isConnected() {
    return Boolean(this.child?.stdin.writable);
  }

  private request(method: string, params: unknown) {
    if (!this.child?.stdin.writable) return Promise.reject(new Error("Kite MCP is unavailable."));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Kite MCP timed out during ${method}.`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.pending.get(id)!.timer = timer;
      this.child!.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  private notify(method: string, params: unknown) {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  private receive(chunk: string) {
    this.buffer += chunk;
    while (true) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd < 0) return;
      const line = this.buffer.slice(0, lineEnd).replace(/\r$/, "");
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } };
        if (typeof message.id !== "number") continue;
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? "Kite MCP request failed."));
        else pending.resolve(message.result);
      } catch {
        // mcp-remote can write non-protocol diagnostics; never expose them to the browser.
      }
    }
  }

  private fail(error: Error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.child = undefined;
  }
}

const globalForKite = globalThis as typeof globalThis & { niveshKiteMcp?: KiteMcpClient };
export const kiteMcp = globalForKite.niveshKiteMcp ?? new KiteMcpClient();
if (process.env.NODE_ENV !== "production") globalForKite.niveshKiteMcp = kiteMcp;

export function resultText(result: McpResult) {
  return (result.content ?? []).map((item) => item.text ?? "").join("\n").trim();
}

export function firstHttpsUrl(value: string) {
  return value.match(/https:\/\/[^\s<>\])"']+/)?.[0];
}

export function resultData(result: McpResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = resultText(result);
  if (!text) return undefined;
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new Error("Kite returned data in an unsupported format.");
  }
}
