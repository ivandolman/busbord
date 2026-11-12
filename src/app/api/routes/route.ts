import { NextResponse, type NextRequest } from "next/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { parseRouteList } from "@/lib/saved-routes";
import { getUserStore } from "@/lib/user-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (routes: unknown) => NextResponse.json({ routes }, { headers: { "Cache-Control": "no-store" } });

export function GET(): NextResponse {
  try {
    return reply(getUserStore().routes());
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Saves one route (body: a SavedRoute) and returns the whole list. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Ongeldige route.");
  }
  const [route] = parseRouteList([body]);
  if (!route || !route.id) return jsonError(400, "Ongeldige route.");
  try {
    return reply(getUserStore().saveRoute(route));
  } catch (error) {
    return handleRouteError(error);
  }
}

export function DELETE(request: NextRequest): NextResponse {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return jsonError(400, "Welke route?");
  try {
    return reply(getUserStore().deleteRoute(id));
  } catch (error) {
    return handleRouteError(error);
  }
}
