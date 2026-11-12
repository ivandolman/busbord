// GET/POST/DELETE /api/routes: the saved routes

import { NextResponse, type NextRequest } from "next/server"

import { z } from "zod"

import { SavedRouteSchema } from "@/features/saved-routes/saved-routes.schema"
import { getUserDataService } from "@/features/user-data/user-data.service"
import { handleRouteError, jsonError, parseQuery } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- SCHEMAS ---

const DeleteRouteQuerySchema = z.object({ id: z.string().min(1) })

// --- HELPERS ---

const reply = (routes: unknown) =>
    NextResponse.json({ routes }, { headers: { "Cache-Control": "no-store" } })

// --- HANDLER ---

export function GET(): NextResponse {
    try {
        return reply(getUserDataService().routes())
    } catch (error) {
        return handleRouteError(error)
    }
}

/** Saves one route (body: a SavedRoute) and returns the whole list. */
export async function POST(request: NextRequest): Promise<NextResponse> {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return jsonError(400, "Ongeldige route.")
    }
    const route = SavedRouteSchema.safeParse(body)
    if (!route.success || !route.data.id) return jsonError(400, "Ongeldige route.")
    try {
        return reply(getUserDataService().saveRoute(route.data))
    } catch (error) {
        return handleRouteError(error)
    }
}

export function DELETE(request: NextRequest): NextResponse {
    const query = parseQuery(DeleteRouteQuerySchema, request.nextUrl.searchParams, "Welke route?")
    if (query.error) return query.error
    try {
        return reply(getUserDataService().deleteRoute(query.data.id))
    } catch (error) {
        return handleRouteError(error)
    }
}
