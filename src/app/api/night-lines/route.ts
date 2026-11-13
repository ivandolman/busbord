// GET /api/night-lines: the night lines under way now or leaving within the hour, for the map

import { NextResponse } from "next/server"

import { networkService } from "@/features/network/network.service"
import { handleRouteError } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

/** No query: the answer depends only on the time. */
export function GET(): NextResponse {
    try {
        const nightLines = networkService.getRunningNightLines()
        return NextResponse.json(nightLines, {
            headers: { "Cache-Control": "private, max-age=60" },
        })
    } catch (error) {
        return handleRouteError(error)
    }
}
