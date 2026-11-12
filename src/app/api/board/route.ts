import { NextResponse, type NextRequest } from "next/server";
import { getAlertSource } from "@/lib/board/alerts";
import { getRealtimeSource } from "@/lib/board/realtime";
import { TimetableRepository } from "@/lib/board/repository";
import { getBoard } from "@/lib/board/service";
import type { Mode } from "@/lib/board/types";
import { getDatabase } from "@/lib/db";
import { getWalker } from "@/lib/roads/walking";
import { maxWalkMeters, walkTieSeconds } from "@/lib/user-data";
import { handleRouteError, isPlaceId, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODES: ReadonlySet<Mode> = new Set<Mode>(["bus", "tram", "metro"]);
const ALL_MODES: ReadonlySet<Mode> = new Set<Mode>(["bus", "tram", "metro", "train", "ferry", "other"]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!isPlaceId(from) || !isPlaceId(to)) return jsonError(400, "Kies een vertrek- en een bestemmingshalte.");
  if (from === to) return jsonError(400, "Vertrek en bestemming zijn dezelfde halte.");

  try {
    const board = await getBoard(new TimetableRepository(getDatabase()), getRealtimeSource(), {
      originId: from,
      destinationId: to,
      includeWalking: params.get("walk") !== "0",
      modes: params.get("trains") === "1" ? ALL_MODES : DEFAULT_MODES,
      now: new Date(),
      walkTieSeconds: walkTieSeconds(params.get("tie")),
      walker: getWalker(),
      maxWalkMeters: maxWalkMeters(params.get("maxWalk")),
      alerts: getAlertSource(),
    });
    return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
