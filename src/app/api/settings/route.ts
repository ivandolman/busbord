import { NextResponse, type NextRequest } from "next/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { getUserStore, MAX_WALK_TIE_MINUTES, parseSettingsUpdate } from "@/lib/user-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (settings: unknown) => NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } });

export function GET(): NextResponse {
  try {
    return reply(getUserStore().settings());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Ongeldige instellingen.");
  }
  const update = parseSettingsUpdate(body);
  if (update === null) return jsonError(400, `Ongeldige instellingen (loopmarge: 0 tot ${MAX_WALK_TIE_MINUTES} minuten).`);
  try {
    return reply(getUserStore().saveSettings(update));
  } catch (error) {
    return handleRouteError(error);
  }
}
