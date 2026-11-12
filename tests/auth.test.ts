import { describe, expect, it } from "vitest";
import {
  authMode,
  createSessionToken,
  isPublicPath,
  LoginLimiter,
  passwordMatches,
  safeNextPath,
  SESSION_MAX_AGE_SECONDS,
  shouldRenew,
  verifySessionToken,
} from "@/lib/auth";

const env = { AUTH_PASSWORD: "correct horse", NODE_ENV: "production" };

describe("auth", () => {
  it("is on with a password, open in development, refuses in production without one", () => {
    expect(authMode(env)).toBe("on");
    expect(authMode({ NODE_ENV: "development" })).toBe("off");
    expect(authMode({ NODE_ENV: "production" })).toBe("misconfigured");
    expect(authMode({ NODE_ENV: "production", AUTH_DISABLED: "true" })).toBe("off");
  });

  it("checks the password", () => {
    expect(passwordMatches("correct horse", env)).toBe(true);
    expect(passwordMatches("correct hors", env)).toBe(false);
    expect(passwordMatches("", {})).toBe(false);
  });

  it("accepts its own sessions until they expire, nothing forged", () => {
    const now = Date.UTC(2026, 10, 12);
    const token = createSessionToken(env, now);
    expect(verifySessionToken(token, env, now)).toBe(now / 1000 + SESSION_MAX_AGE_SECONDS);
    expect(verifySessionToken(token, env, now + (SESSION_MAX_AGE_SECONDS + 1) * 1000)).toBeNull();

    const [expires, mac] = token.split(".");
    expect(verifySessionToken(`${Number(expires) + 1000}.${mac}`, env, now)).toBeNull();
    expect(verifySessionToken(token, { ...env, AUTH_PASSWORD: "other" }, now)).toBeNull();
    expect(verifySessionToken(token, { ...env, AUTH_SECRET: "separate" }, now)).toBeNull();
    expect(verifySessionToken("garbage", env, now)).toBeNull();
    expect(verifySessionToken(undefined, env, now)).toBeNull();
  });

  it("renews sessions in their second half", () => {
    const now = 1_000_000_000_000;
    expect(shouldRenew(now / 1000 + SESSION_MAX_AGE_SECONDS, now)).toBe(false);
    expect(shouldRenew(now / 1000 + SESSION_MAX_AGE_SECONDS / 3, now)).toBe(true);
  });

  it("only returns to paths on this site", () => {
    expect(safeNextPath("/?from=a&to=b")).toBe("/?from=a&to=b");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("/login?next=/")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });

  it("keeps data behind the login", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/_next/static/chunk.js")).toBe(true);
    for (const path of ["/", "/api/routes", "/api/board", "/api/settings", "/loginx"]) expect(isPublicPath(path)).toBe(false);
  });

  it("slows down password guessing", () => {
    const limiter = new LoginLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) {
      expect(limiter.retryAfterMs("a", i)).toBe(0);
      limiter.fail("a", i);
    }
    expect(limiter.retryAfterMs("a", 10)).toBeGreaterThan(0);
    expect(limiter.retryAfterMs("b", 10)).toBe(0);
    expect(limiter.retryAfterMs("a", 60_000)).toBe(0);
  });
});
