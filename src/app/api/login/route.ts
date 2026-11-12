// POST /api/login: checks the shared password from the login form and starts a session

import { type NextRequest, type NextResponse } from "next/server"

import {
    createSessionToken,
    globalLoginLimiter,
    isHttps,
    LoginFormSchema,
    loginLimiter,
    passwordMatches,
    seeOther,
    sessionCookie,
} from "@/lib/auth"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HELPERS ---

function clientKey(request: NextRequest): string {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    return forwarded || request.headers.get("x-real-ip") || "direct"
}

// --- HANDLER ---

export async function POST(request: NextRequest): Promise<NextResponse> {
    let form: FormData
    try {
        form = await request.formData()
    } catch {
        // 303 so the browser follows with a GET (a plain HTML form posts here).
        return seeOther("/login?error=1")
    }
    const { password, next } = LoginFormSchema.parse({
        password: form.get("password"),
        next: form.get("next"),
    })
    const back = (error: string) =>
        seeOther(`/login?${new URLSearchParams({ error, ...(next !== "/" ? { next } : {}) })}`)

    const client = clientKey(request)
    if (loginLimiter.retryAfterMs(client) > 0 || globalLoginLimiter.retryAfterMs("all") > 0) {
        return back("wait")
    }

    if (!password || !passwordMatches(password)) {
        loginLimiter.fail(client)
        globalLoginLimiter.fail("all")
        return back("1")
    }
    loginLimiter.succeed(client)

    const response = seeOther(next)
    response.cookies.set(
        sessionCookie(
            createSessionToken(),
            isHttps(request.nextUrl, request.headers.get("x-forwarded-proto")),
        ),
    )
    response.headers.set("Cache-Control", "no-store")
    return response
}
