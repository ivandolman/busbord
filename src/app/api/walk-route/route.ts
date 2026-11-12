import { NextResponse, type NextRequest } from "next/server";
import { distanceMeters } from "@/lib/geo";
import { jsonError } from "@/lib/http";
import { parsePointId } from "@/lib/place";
import { getWalker } from "@/lib/roads/walking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nobody walks further to a bus; longer requests are refused rather than routed. */
const MAX_METERS = 4000;

/**
 * `?from=@lat,lon&to=@lat,lon`: the walking route between two points along streets and
 * footpaths. `path` is null without a road network or when either end is off it; the map then
 * draws a straight dashed line.
 */
export function GET(request: NextRequest): NextResponse {
  const params = request.nextUrl.searchParams;
  const from = parsePointId(params.get("from") ?? "");
  const to = parsePointId(params.get("to") ?? "");
  if (!from || !to) return jsonError(400, "Ongeldige punten.");
  if (distanceMeters(from.lat, from.lon, to.lat, to.lon) > MAX_METERS) return jsonError(400, "Te ver om te lopen.");
  const path = getWalker()?.route([from.lat, from.lon], [to.lat, to.lon]) ?? null;
  return NextResponse.json(
    { path: path?.map(([lat, lon]) => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]) ?? null },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
