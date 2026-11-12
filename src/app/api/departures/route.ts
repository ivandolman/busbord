import { NextResponse, type NextRequest } from "next/server";
import { getRealtimeSource } from "@/lib/board/realtime";
import { TimetableRepository } from "@/lib/board/repository";
import { getStopBoard } from "@/lib/board/service";
import type { Mode } from "@/lib/board/types";
import { getDatabase } from "@/lib/db";
import { getWalker } from "@/lib/roads/walking";
import { maxWalkMeters } from "@/lib/user-data";
import { handleRouteError, isPlaceId, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES: ReadonlySet<Mode> = new Set<Mode>(["bus", "tram", "metro", "ferry"]);
const HORIZON_SECONDS = 60 * 60;
const LIMIT = 80;

/**
 * Next hour of departures from one stop, every line; `to` marks the ones that reach a destination,
 * `from` adds the walk from there to each of the stop's poles.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const stop = params.get("stop");
  const to = params.get("to");
  const from = params.get("from");
  if (!isPlaceId(stop) || (to !== null && !isPlaceId(to)) || (from !== null && !isPlaceId(from))) {
    return jsonError(400, "Onbekende halte.");
  }

  try {
    const board = await getStopBoard(new TimetableRepository(getDatabase()), getRealtimeSource(), {
      stopId: stop,
      destinationId: to === stop ? null : to,
      includeWalking: params.get("walk") !== "0",
      modes: MODES,
      now: new Date(),
      horizonSeconds: HORIZON_SECONDS,
      limit: LIMIT,
      originId: from,
      walker: getWalker(),
      maxWalkMeters: maxWalkMeters(params.get("maxWalk")),
    });
    return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
