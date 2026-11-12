import { NextResponse, type NextRequest } from "next/server";
import { authMode, createSessionToken, isHttps, isPublicPath, SESSION_COOKIE, sessionCookie, shouldRenew, verifySessionToken } from "@/lib/auth";

/** Every page and API call needs a login (src/lib/auth.ts), except the login page and its assets. */
export function proxy(request: NextRequest): NextResponse {
  const mode = authMode();
  if (mode === "off") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (mode === "misconfigured") {
    console.error("AUTH_PASSWORD is not set. Set it, or AUTH_DISABLED=true to run without a login.");
    return new NextResponse("Inloggen is niet ingesteld (AUTH_PASSWORD ontbreekt).", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (isPublicPath(pathname)) return NextResponse.next();

  const expiresAt = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (expiresAt === null) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Log eerst in." },
        { status: 401, headers: { "Cache-Control": "no-store", "X-Auth-Required": "1" } },
      );
    }
    // Absolute on purpose: Next requires it here and makes a same-host redirect relative itself.
    const login = new URL("/login", request.url);
    if (pathname !== "/" || search) login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login, 303);
  }

  const response = NextResponse.next();
  if (shouldRenew(expiresAt)) {
    response.cookies.set(sessionCookie(createSessionToken(), isHttps(request.nextUrl, request.headers.get("x-forwarded-proto"))));
  }
  return response;
}

export const config = {
  // Everything; isPublicPath above lets the login page and static files through.
  matcher: "/:path*",
};
