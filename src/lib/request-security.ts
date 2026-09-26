import "server-only";

import type { NextRequest } from "next/server";

export function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function authorizeMutation(request: NextRequest, expectedAction: string) {
  const origin = request.headers.get("origin");
  const action = request.headers.get("x-nivesh-action");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || action !== expectedAction || (fetchSite && fetchSite !== "same-origin")) return false;

  try {
    const originUrl = new URL(origin);
    const host = request.headers.get("host") ?? request.nextUrl.host;
    return originUrl.host === host && isLoopbackHostname(originUrl.hostname);
  } catch {
    return false;
  }
}
