import { beforeEach, describe, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mutual-funds-service", () => ({ readMutualFunds: read }));
import { GET } from "./route";
describe("mutual-fund API", () => {
  beforeEach(() => { read.mockReset(); });
  it("returns sensitive fund data with no-store headers", async () => {
    read.mockResolvedValue({ holdings: [], source: "kite" });
    const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ holdings: [], source: "kite" });
  });
  it("reports authorization failures", async () => {
    read.mockRejectedValue(new Error("Please log in first")); const unauthorized = await GET();
    expect(unauthorized.status).toBe(401); expect(await unauthorized.json()).toMatchObject({ requiresLogin: true });
  });
  it("sanitizes gateway HTML", async () => {
    read.mockRejectedValue(new Error("<!doctype html><html>Cloudflare challenge</html>")); const blocked = await GET();
    expect(blocked.status).toBe(502); const body = await blocked.json(); expect(body.error).toContain("upstream security gateway"); expect(body.error).not.toContain("<html>");
  });
});
