import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { authorizeMutation, isLoopbackHostname } from "./request-security";

describe("request security", () => {
  it.each(["localhost", "127.0.0.1", "::1", "[::1]"])("accepts loopback host %s", (host) => {
    expect(isLoopbackHostname(host)).toBe(true);
  });

  it("requires a matching loopback origin and action", () => {
    const request = new NextRequest("http://127.0.0.1:3000/api/settings", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "sec-fetch-site": "same-origin",
        "x-nivesh-action": "update-settings",
      },
    });
    expect(authorizeMutation(request, "update-settings")).toBe(true);
    expect(authorizeMutation(request, "kite-login")).toBe(false);
  });

  it("rejects non-loopback and cross-site origins", () => {
    const request = new NextRequest("http://localhost:3000/api/settings", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "cross-site",
        "x-nivesh-action": "update-settings",
      },
    });
    expect(authorizeMutation(request, "update-settings")).toBe(false);
  });
});
