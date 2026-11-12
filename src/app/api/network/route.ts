// GET /api/network: every line and stop for the map, revalidated with an ETag

import { networkService } from "@/features/network/network.service"
import { handleRouteError } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

/** The payload is ~1.5 MB and changes only with a new import: browsers revalidate, not re-download. */
export function GET(request: Request): Response {
    try {
        const { json, etag } = networkService.getNetworkJson()
        const headers = { ETag: etag, "Cache-Control": "no-cache" }
        if (request.headers.get("if-none-match") === etag) {
            return new Response(null, { status: 304, headers })
        }
        return new Response(json, { headers: { ...headers, "Content-Type": "application/json" } })
    } catch (error) {
        return handleRouteError(error)
    }
}
