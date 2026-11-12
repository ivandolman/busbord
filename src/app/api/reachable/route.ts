import { NextResponse, type NextRequest } from "next/server";
import { modeFromRouteType, pickBestPairPerTrip, worthwhileRides } from "@/lib/board/build-board";
import { TimetableRepository } from "@/lib/board/repository";
import { resolveEndpoint, splitSharedPlatforms } from "@/lib/board/service";
import { getDatabase } from "@/lib/db";
import { getWalker } from "@/lib/roads/walking";
import { maxWalkMeters, walkTieSeconds } from "@/lib/user-data";
import { handleRouteError, isPlaceId, jsonError } from "@/lib/http";
import { rideSegments, type RideSegment } from "@/lib/network/segments";
import { localServiceDate, serviceDayStart } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { areaId: string; routeId: string; routeType: number };

/**
 * Where to draw each stop area for a planned route: in the middle of the platforms actually used.
 * An area's own position averages all its platforms, which can lie well beside the line's end.
 */
function platformPositions(segments: RideSegment[]): Record<string, [number, number]> {
  const sums = new Map<string, { lat: number; lon: number; count: number; seen: Set<string> }>();
  for (const segment of segments) {
    for (const stop of segment.stops) {
      const sum = sums.get(stop.areaId) ?? { lat: 0, lon: 0, count: 0, seen: new Set<string>() };
      const key = stop.position.join(",");
      if (!sum.seen.has(key)) {
        sum.seen.add(key);
        sum.lat += stop.position[0];
        sum.lon += stop.position[1];
        sum.count += 1;
      }
      sums.set(stop.areaId, sum);
    }
  }
  const round = (value: number) => Math.round(value * 1e5) / 1e5;
  return Object.fromEntries(
    [...sums].map(([areaId, sum]) => [areaId, [round(sum.lat / sum.count), round(sum.lon / sum.count)]]),
  );
}

/**
 * What the map should show for the current selection, for today and without changing:
 * - only an origin: routes leaving it and the stops they reach;
 * - only a destination: routes arriving there and the stops you can board them;
 * - both: only the stretch of each line you would ride, from where you board to where you get off
 *   (chosen per trip exactly as on the board, leaving out stretches far slower than the quickest),
 *   and the stops along those stretches.
 */
export function GET(request: NextRequest): NextResponse {
  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if ((from !== null && !isPlaceId(from)) || (to !== null && !isPlaceId(to)) || (from === null && to === null)) {
    return jsonError(400, "Kies een vertrekpunt of bestemming.");
  }
  const walk = params.get("walk") !== "0";

  try {
    const repository = new TimetableRepository(getDatabase());
    const today = localServiceDate(Date.now());
    const walker = getWalker();
    const endpoint = { walking: walk, walker, maxWalkMeters: maxWalkMeters(params.get("maxWalk")) };
    const origin = from ? resolveEndpoint(repository, from, { ...endpoint, role: "from" }) : null;
    const destination = to ? resolveEndpoint(repository, to, { ...endpoint, role: "to" }) : null;
    if (origin && destination) splitSharedPlatforms(origin, destination);

    if (origin && destination) {
      const dayStart = serviceDayStart(today);
      const candidates = repository
        .findCandidates([...origin.walkMeters.keys()], [...destination.walkMeters.keys()], today, dayStart, dayStart + 36 * 3600)
        .filter((candidate) => candidate.mode !== "train");
      const trips = pickBestPairPerTrip(
        candidates,
        origin.walkMeters,
        destination.walkMeters,
        walkTieSeconds(params.get("tie")),
      );
      // Only stretches you would sensibly ride, not a ring line the long way round.
      const pairs = worthwhileRides(trips, origin.walkMeters, destination.walkMeters).map((candidate) => ({
        routeId: candidate.routeId,
        fromStopId: candidate.fromStopId,
        toStopId: candidate.toStopId,
      }));
      const segments: RideSegment[] = rideSegments(getDatabase(), pairs);
      return NextResponse.json(
        {
          direction: "both",
          areas: [...new Set(segments.flatMap((segment) => segment.areaIds))],
          routes: [...new Set(segments.map((segment) => segment.routeId))],
          segments: segments.map(({ routeId, path }) => ({ routeId, path })),
          positions: platformPositions(segments),
          boardAreas: repository.areasOfStops([...origin.walkMeters.keys()]),
        },
        { headers: { "Cache-Control": "private, max-age=300" } },
      );
    }

    let rows: Row[];
    if (origin) {
      rows = repository.reachableFrom([...origin.walkMeters.keys()], today);
    } else {
      rows = repository.reachingTo([...(destination?.walkMeters.keys() ?? [])], today);
    }

    const areas = new Set<string>();
    const routes = new Set<string>();
    for (const row of rows) {
      if (modeFromRouteType(row.routeType) === "train") continue;
      areas.add(row.areaId);
      routes.add(row.routeId);
    }
    return NextResponse.json(
      {
        direction: origin ? "from" : "to",
        areas: [...areas],
        routes: [...routes],
        segments: null,
        // Where you can get on: the origin's stops; with only a destination, any stop on the map.
        boardAreas: origin ? repository.areasOfStops([...origin.walkMeters.keys()]) : null,
      },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
