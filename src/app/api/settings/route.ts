// GET/PUT /api/settings: the traveller's settings

import { NextResponse, type NextRequest } from "next/server"

import { MAX_WALK_TIE_MINUTES, SettingsUpdateSchema } from "@/features/user-data/user-data.schema"
import { getUserDataService } from "@/features/user-data/user-data.service"
import { handleRouteError, jsonError } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HELPERS ---

const reply = (settings: unknown) =>
    NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } })

// --- HANDLER ---

export function GET(): NextResponse {
    try {
        return reply(getUserDataService().settings())
    } catch (error) {
        return handleRouteError(error)
    }
}

/** Changes the settings in the body; the others keep their value. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return jsonError(400, "Ongeldige instellingen.")
    }
    const update = SettingsUpdateSchema.safeParse(body)
    if (!update.success) {
        return jsonError(
            400,
            `Ongeldige instellingen (loopmarge: 0 tot ${MAX_WALK_TIE_MINUTES} minuten).`,
        )
    }
    try {
        return reply(getUserDataService().saveSettings(update.data))
    } catch (error) {
        return handleRouteError(error)
    }
}
