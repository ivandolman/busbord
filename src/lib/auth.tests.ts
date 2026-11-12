// Unit tests for the login: auth mode, password, session tokens, redirects and rate limiting

import assert from "node:assert"
import { describe, it } from "node:test"

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
} from "@/lib/auth"

const env = { AUTH_PASSWORD: "correct horse", NODE_ENV: "production" }

describe("auth", () => {
    it("is on with a password, open in development, refuses in production without one", () => {
        assert.strictEqual(authMode(env), "on")
        assert.strictEqual(authMode({ NODE_ENV: "development" }), "off")
        assert.strictEqual(authMode({ NODE_ENV: "production" }), "misconfigured")
        assert.strictEqual(authMode({ NODE_ENV: "production", AUTH_DISABLED: "true" }), "off")
    })

    it("checks the password", () => {
        assert.strictEqual(passwordMatches("correct horse", env), true)
        assert.strictEqual(passwordMatches("correct hors", env), false)
        assert.strictEqual(passwordMatches("", {}), false)
    })

    it("accepts its own sessions until they expire, nothing forged", () => {
        const now = Date.UTC(2026, 10, 12)
        const token = createSessionToken(env, now)
        assert.strictEqual(
            verifySessionToken(token, env, now),
            now / 1000 + SESSION_MAX_AGE_SECONDS,
        )
        assert.strictEqual(
            verifySessionToken(token, env, now + (SESSION_MAX_AGE_SECONDS + 1) * 1000),
            null,
        )

        const [expires, mac] = token.split(".")
        assert.strictEqual(verifySessionToken(`${Number(expires) + 1000}.${mac}`, env, now), null)
        assert.strictEqual(verifySessionToken(token, { ...env, AUTH_PASSWORD: "other" }, now), null)
        assert.strictEqual(
            verifySessionToken(token, { ...env, AUTH_SECRET: "separate" }, now),
            null,
        )
        assert.strictEqual(verifySessionToken("garbage", env, now), null)
        assert.strictEqual(verifySessionToken(undefined, env, now), null)
    })

    it("renews sessions in their second half", () => {
        const now = 1_000_000_000_000
        assert.strictEqual(shouldRenew(now / 1000 + SESSION_MAX_AGE_SECONDS, now), false)
        assert.strictEqual(shouldRenew(now / 1000 + SESSION_MAX_AGE_SECONDS / 3, now), true)
    })

    it("only returns to paths on this site", () => {
        assert.strictEqual(safeNextPath("/?from=a&to=b"), "/?from=a&to=b")
        assert.strictEqual(safeNextPath("//evil.example"), "/")
        assert.strictEqual(safeNextPath("/\\evil.example"), "/")
        assert.strictEqual(safeNextPath("https://evil.example"), "/")
        assert.strictEqual(safeNextPath("/login?next=/"), "/")
        assert.strictEqual(safeNextPath(null), "/")
    })

    it("keeps data behind the login", () => {
        assert.strictEqual(isPublicPath("/login"), true)
        assert.strictEqual(isPublicPath("/api/health"), true)
        assert.strictEqual(isPublicPath("/_next/static/chunk.js"), true)
        for (const path of ["/", "/api/routes", "/api/board", "/api/settings", "/loginx"]) {
            assert.strictEqual(isPublicPath(path), false)
        }
    })

    it("slows down password guessing", () => {
        const limiter = new LoginLimiter(3, 60_000)
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(limiter.retryAfterMs("a", i), 0)
            limiter.fail("a", i)
        }
        assert.ok(limiter.retryAfterMs("a", 10) > 0)
        assert.strictEqual(limiter.retryAfterMs("b", 10), 0)
        assert.strictEqual(limiter.retryAfterMs("a", 60_000), 0)
    })
})
