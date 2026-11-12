import { NextResponse } from "next/server";
import { UnknownAreaError } from "./board/service";
import { DatabaseMissingError } from "./db";

export { isAreaId, isPlaceId } from "./place";

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Maps known failures to useful responses; anything else is logged and hidden from the client. */
export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof UnknownAreaError) return jsonError(404, "Onbekende halte.");
  if (error instanceof DatabaseMissingError) return jsonError(503, "De dienstregeling is nog niet geïmporteerd.");
  console.error(error);
  return jsonError(500, "Er ging iets mis.");
}
