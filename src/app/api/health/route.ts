// GET /api/health: liveness and timetable presence for the container healthcheck

import { existsSync } from "node:fs"
import { NextResponse } from "next/server"

import { config } from "@/lib/config"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

/**
 * For the container healthcheck (Coolify, Docker). Public, so it says nothing but whether the
 * server runs and whether a timetable is there yet: during the first import the app is healthy
 * but the board answers "nog niet geïmporteerd".
 */
export function GET(): NextResponse {
    return NextResponse.json(
        { ok: true, timetable: existsSync(config.dbPath) },
        { headers: { "Cache-Control": "no-store" } },
    )
}
