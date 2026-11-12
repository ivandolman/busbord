import { NextResponse, type NextRequest } from "next/server";
import { getRealtimeSource } from "@/lib/board/realtime";
import { TimetableRepository } from "@/lib/board/repository";
import { getNextDepartures } from "@/lib/board/next-departures";
import type { Mode } from "@/lib/board/types";
import { getDatabase } from "@/lib/db";
import { handleRouteError, isAreaId, isPlaceId, jsonError } from "@/lib/http";
import { getWalker } from "@/lib/roads/walking";
import { maxWalkMeters } from "@/lib/user-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES: ReadonlySet<Mode> = new Set<Mode>(["bus", "tram", "metro", "ferry"]);
const HORIZON_SECONDS = 90 * 60;
/** About what fits on screen with labels; more is refused rather than slowly answered. */
const MAX_AREAS = 120;

/** `?areas=a,b,c&to=…&walk=`: per stop area, the next ride of each line towards `to`. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const to = params.get("to");
  const areaIds = [...new Set((params.get("areas") ?? "").split(",").filter(Boolean))];
  if (!isPlaceId(to)) return jsonError(400, "Kies een bestemming.");
  if (areaIds.length === 0 || areaIds.length > MAX_AREAS || !areaIds.every((id) => isAreaId(id))) {
    return jsonError(400, "Onbekende haltes.");
  }
  try {
    const result = await getNextDepartures(new TimetableRepository(getDatabase()), getRealtimeSource(), {
      areaIds,
      destinationId: to,
      includeWalking: params.get("walk") !== "0",
      modes: MODES,
      now: new Date(),
      horizonSeconds: HORIZON_SECONDS,
      walker: getWalker(),
      maxWalkMeters: maxWalkMeters(params.get("maxWalk")),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
