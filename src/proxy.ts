import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (!local) {
    return NextResponse.json(
      { error: "Nivesh is a local-only application." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
