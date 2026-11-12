import { getDatabase } from "@/lib/db";
import { handleRouteError } from "@/lib/http";
import { getNetworkJson } from "@/lib/network/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every line and stop for the map. It changes only with a new import, so the browser revalidates
 * with an ETag (a hash of the payload) instead of downloading ~1.5 MB on every visit.
 */
export function GET(request: Request): Response {
  try {
    const { json, etag } = getNetworkJson(getDatabase());
    const headers = { ETag: etag, "Cache-Control": "no-cache" };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(json, { headers: { ...headers, "Content-Type": "application/json" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
