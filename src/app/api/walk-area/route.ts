import { NextResponse, type NextRequest } from "next/server";
import { STRAIGHT_LINE_DETOUR, WALK_SECONDS_PER_METER } from "@/lib/board/build-board";
import { TimetableRepository } from "@/lib/board/repository";
import { endpointWalkLimit } from "@/lib/board/service";
import { getDatabase } from "@/lib/db";
import { handleRouteError, isPlaceId, jsonError } from "@/lib/http";
import { parsePointId } from "@/lib/place";
import { getWalker } from "@/lib/roads/walking";
import { maxWalkMeters } from "@/lib/user-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `?id=&walk=&role=from|to&maxWalk=`: the area within walking distance of an origin or
 * destination, the same limit the board uses to pick stops. `polygon` is null without a road
 * network (or off it); the map then draws a circle of `radiusMeters` as the crow flies.
 */
export function GET(request: NextRequest): NextResponse {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");
  const role = params.get("role") === "to" ? "to" : "from";
  if (!isPlaceId(id)) return jsonError(400, "Onbekende plek.");

  try {
    const point = parsePointId(id);
    let center: [number, number];
    if (point) {
      center = [point.lat, point.lon];
    } else {
      const area = new TimetableRepository(getDatabase()).getArea(id);
      if (!area) return jsonError(404, "Onbekende halte.");
      center = [area.lat, area.lon];
    }
    const limitMeters = endpointWalkLimit(id, {
      walking: params.get("walk") !== "0",
      role,
      maxWalkMeters: maxWalkMeters(params.get("maxWalk")),
    });
    const polygon = limitMeters > 0 ? (getWalker()?.area(center, limitMeters) ?? null) : null;
    return NextResponse.json(
      {
        center,
        radiusMeters: Math.round(limitMeters / STRAIGHT_LINE_DETOUR),
        limitMeters,
        minutes: Math.round((limitMeters * WALK_SECONDS_PER_METER) / 60),
        polygon: polygon?.map(([lat, lon]) => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]) ?? null,
      },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
