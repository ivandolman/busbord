import { NextResponse, type NextRequest } from "next/server";
import { TimetableRepository } from "@/lib/board/repository";
import { config } from "@/lib/config";
import { getDatabase } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 60;
const RESULT_LIMIT = 8;

export function GET(request: NextRequest): NextResponse {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ stops: [] });
  if (query.length > MAX_QUERY_LENGTH) return jsonError(400, "Zoekterm is te lang.");

  try {
    const stops = new TimetableRepository(getDatabase())
      .searchAreas(query, RESULT_LIMIT, config.board.sameStopMeters)
      .map(({ id, name }) => ({ id, name }));
    return NextResponse.json({ stops }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
