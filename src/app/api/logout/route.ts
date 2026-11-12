import { NextResponse, type NextRequest } from "next/server";
import { isHttps, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ends the session on this device. POST only, so a link elsewhere cannot log someone out. */
export function POST(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL("/login?out=1", request.url), 303);
  response.cookies.set(sessionCookie("", isHttps(request.nextUrl, request.headers.get("x-forwarded-proto")), 0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
