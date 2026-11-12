// POST /api/logout: ends the session on this device

import { type NextRequest, type NextResponse } from "next/server"

import { isHttps, seeOther, sessionCookie } from "@/lib/auth"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

/** POST only, so a link elsewhere cannot log someone out. */
export function POST(request: NextRequest): NextResponse {
    const response = seeOther("/login?out=1")
    response.cookies.set(
        sessionCookie("", isHttps(request.nextUrl, request.headers.get("x-forwarded-proto")), 0),
    )
    response.headers.set("Cache-Control", "no-store")
    return response
}
