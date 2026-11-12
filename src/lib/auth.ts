import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Password login for the whole app. One shared password (AUTH_PASSWORD), because there is one
 * list of saved routes for everyone who may use the app. A login sets a signed session cookie;
 * src/proxy.ts checks it on every request.
 *
 * Without AUTH_PASSWORD the app is open in development and refuses to serve in production,
 * unless AUTH_DISABLED=true says that is intended (for example behind a proxy that already
 * authenticates).
 */

export const SESSION_COOKIE = "bb_session";
/** A session lasts this long and is renewed when used in its second half. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type AuthMode = "on" | "off" | "misconfigured";

export interface AuthEnv {
  AUTH_PASSWORD?: string;
  AUTH_SECRET?: string;
  AUTH_DISABLED?: string;
  NODE_ENV?: string;
}

export function authMode(env: AuthEnv = process.env): AuthMode {
  if (env.AUTH_DISABLED === "true") return "off";
  if (env.AUTH_PASSWORD) return "on";
  return env.NODE_ENV === "production" ? "misconfigured" : "off";
}

/**
 * The key sessions are signed with. AUTH_SECRET when set; otherwise derived from the password,
 * so changing the password signs everyone out.
 */
function signingKey(env: AuthEnv): Buffer {
  const base = env.AUTH_SECRET || env.AUTH_PASSWORD;
  if (!base) throw new Error("No AUTH_PASSWORD or AUTH_SECRET to sign sessions with");
  return createHash("sha256").update(`bestemmingsbord-session\0${base}`).digest();
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** Constant-time comparison (both sides hashed first, so the length does not leak either). */
export function passwordMatches(candidate: string, env: AuthEnv = process.env): boolean {
  if (!env.AUTH_PASSWORD) return false;
  return timingSafeEqual(sha256(candidate), sha256(env.AUTH_PASSWORD));
}

function signature(payload: string, env: AuthEnv): string {
  return createHmac("sha256", signingKey(env)).update(payload).digest("base64url");
}

/** "<expires at, unix seconds>.<HMAC>". Holds nothing secret; it only proves a login happened. */
export function createSessionToken(env: AuthEnv = process.env, nowMs = Date.now()): string {
  const expiresAt = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_SECONDS;
  return `${expiresAt}.${signature(String(expiresAt), env)}`;
}

/** The session's expiry (unix seconds) when the token is genuine and current, else null. */
export function verifySessionToken(token: string | undefined, env: AuthEnv = process.env, nowMs = Date.now()): number | null {
  if (!token || token.length > 200) return null;
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!match) return null;
  const [, expires, given] = match as unknown as [string, string, string];
  const expected = Buffer.from(signature(expires, env));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const expiresAt = Number(expires);
  return expiresAt > nowMs / 1000 ? expiresAt : null;
}

/** True when a valid session should be reissued so an app in daily use never logs out. */
export function shouldRenew(expiresAt: number, nowMs = Date.now()): boolean {
  return expiresAt - nowMs / 1000 < SESSION_MAX_AGE_SECONDS / 2;
}

/** Where to go after logging in: only a path on this site, never another host. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.startsWith("/login") || raw.startsWith("/api/")) return "/";
  return raw.length > 2000 ? "/" : raw;
}

/** Paths that work without logging in: the login itself and what the browser needs to show it. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/login" ||
    pathname === "/api/logout" ||
    pathname === "/api/health" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon.svg" ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/")
  );
}

/**
 * Failed logins per client, so the password cannot be guessed quickly. In memory: it resets on
 * a restart, which is fine for one process; put a limit at the reverse proxy as well.
 */
export class LoginLimiter {
  private failures = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60_000,
  ) {}

  /** Milliseconds until this client may try again, 0 when it may try now. */
  retryAfterMs(client: string, nowMs = Date.now()): number {
    const entry = this.failures.get(client);
    if (!entry) return 0;
    if (nowMs - entry.since >= this.windowMs) {
      this.failures.delete(client);
      return 0;
    }
    return entry.count >= this.maxFailures ? entry.since + this.windowMs - nowMs : 0;
  }

  fail(client: string, nowMs = Date.now()): void {
    const entry = this.failures.get(client);
    if (!entry || nowMs - entry.since >= this.windowMs) this.failures.set(client, { count: 1, since: nowMs });
    else entry.count += 1;
    if (this.failures.size > 10_000) this.prune(nowMs);
  }

  succeed(client: string): void {
    this.failures.delete(client);
  }

  private prune(nowMs: number): void {
    for (const [client, entry] of this.failures) if (nowMs - entry.since >= this.windowMs) this.failures.delete(client);
  }
}

export const loginLimiter = new LoginLimiter();
/** All clients together, against guessing from many addresses at once. */
export const globalLoginLimiter = new LoginLimiter(50);

/** Secure cookies need HTTPS; on a plain-HTTP home network they would never be sent back. */
export function isHttps(url: URL, forwardedProto: string | null): boolean {
  return url.protocol === "https:" || forwardedProto?.split(",")[0]?.trim() === "https";
}

export function sessionCookie(value: string, secure: boolean, maxAge = SESSION_MAX_AGE_SECONDS) {
  return { name: SESSION_COOKIE, value, httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge };
}
