import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, globalLoginLimiter, isHttps, loginLimiter, passwordMatches, safeNextPath, seeOther, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "direct";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let password = "";
  let next = "/";
  try {
    const form = await request.formData();
    password = String(form.get("password") ?? "");
    next = safeNextPath(String(form.get("next") ?? "/"));
  } catch {
    // 303 so the browser follows with a GET (a plain HTML form posts here).
    return seeOther("/login?error=1");
  }
  const back = (error: string) => seeOther(`/login?${new URLSearchParams({ error, ...(next !== "/" ? { next } : {}) })}`);

  const client = clientKey(request);
  if (loginLimiter.retryAfterMs(client) > 0 || globalLoginLimiter.retryAfterMs("all") > 0) return back("wait");

  if (!password || password.length > 1000 || !passwordMatches(password)) {
    loginLimiter.fail(client);
    globalLoginLimiter.fail("all");
    return back("1");
  }
  loginLimiter.succeed(client);

  const response = seeOther(next);
  response.cookies.set(sessionCookie(createSessionToken(), isHttps(request.nextUrl, request.headers.get("x-forwarded-proto"))));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
