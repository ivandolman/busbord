import { NextResponse, type NextRequest } from "next/server";
import { TimetableRepository } from "@/lib/board/repository";
import { resolveEndpoint } from "@/lib/board/service";
import { getDatabase } from "@/lib/db";
import { handleRouteError, isPlaceId, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Display name for a stop area or map point, for selections restored from the URL. */
export function GET(request: NextRequest): NextResponse {
  const id = request.nextUrl.searchParams.get("id");
  if (!isPlaceId(id)) return jsonError(400, "Onbekende plek.");
  try {
    const { area } = resolveEndpoint(new TimetableRepository(getDatabase()), id, { walking: false, role: "from" });
    return NextResponse.json({ id, name: area.name }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
