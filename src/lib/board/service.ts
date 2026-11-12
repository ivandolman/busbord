import { config } from "../config";
import { localServiceDate, shiftServiceDate } from "../time";
import type { Walker } from "../roads/walking";
import { distanceMeters } from "../geo";
import {
  minutesToWalkMeters,
  pickBestPairPerTrip,
  rankDepartures,
  STRAIGHT_LINE_DETOUR,
  summarise,
  toDeparture,
  WALK_SECONDS_PER_METER,
} from "./build-board";
import { matchAlerts, type AlertSource } from "./alerts";
import { shortHeadsign } from "./group";
import { findTransfers } from "./transfers";
import type { RealtimeSource } from "./realtime";
import type { StopDepartureRow, TimetableRepository } from "./repository";
import { parsePointId } from "../place";
import type { Area, Board, Candidate, Endpoint, Mode, StopBoard, StopDeparture, StopPole } from "./types";

export interface BoardRequest {
  originId: string;
  destinationId: string;
  includeWalking: boolean;
  modes: ReadonlySet<Mode>;
  now: Date;
  /** Pairs this much slower than the quickest still count as quick enough to prefer less walking. */
  walkTieSeconds?: number;
  /** Real walking routes; without one, walks are estimated from straight lines. */
  walker?: Walker | null;
  /** The longest walk to or from a stop, in metres. */
  maxWalkMeters?: number;
  alerts?: AlertSource | null;
}

export class UnknownAreaError extends Error {
  constructor(public readonly areaId: string) {
    super(`Unknown stop area: ${areaId}`);
    this.name = "UnknownAreaError";
  }
}

/** A map point is named after the busiest stop this close ("Bij Utrecht, Kleinesingel"). */
const POINT_NAME_METERS = 800;


/** How an origin or destination picks its stops. */
export interface EndpointOptions {
  /** "Ook haltes op loopafstand". */
  walking: boolean;
  role: "from" | "to";
  /** The traveller's longest walk to (or from) a stop; default config.board.defaultMaxWalkMinutes. */
  maxWalkMeters?: number;
  walker?: Walker | null;
}

/**
 * How far you may walk to a stop that is not the one you chose:
 * - a point on the map: the longest walk you set; with walking off, the shorter of that and a few
 *   hundred metres (a point has no stop of its own);
 * - a stop as origin: the longest walk with walking on, else only the stop itself;
 * - a stop as destination: just across the street (getting off further away is a different place).
 */
export function endpointWalkLimit(id: string, options: EndpointOptions): number {
  const { board } = config;
  const max = options.maxWalkMeters ?? minutesToWalkMeters(board.defaultMaxWalkMinutes);
  if (parsePointId(id)) return options.walking ? max : Math.min(max, Math.round(board.pointMeters * STRAIGHT_LINE_DETOUR));
  if (!options.walking) return 0;
  return options.role === "from" ? max : Math.min(max, Math.round(board.destinationWalkMeters * STRAIGHT_LINE_DETOUR));
}

/**
 * The platforms within a walk of `limit` metres from a place, each with its walk. With a walker,
 * along streets and footpaths (a stop across the water is out, however close it looks); without
 * one, the straight line plus STRAIGHT_LINE_DETOUR.
 */
function platformsWithinWalk(
  repository: TimetableRepository,
  from: [number, number],
  limit: number,
  walker: Walker | null,
): Map<string, number> {
  const result = new Map<string, number>();
  if (limit <= 0) return result;
  if (!walker) {
    for (const [id, line] of repository.stopsNear(from[0], from[1], limit / STRAIGHT_LINE_DETOUR)) {
      result.set(id, Math.round(line * STRAIGHT_LINE_DETOUR));
    }
    return result;
  }
  // Walking is never shorter than the straight line: nothing beyond `limit` that way can count.
  const straight = repository.stopsNear(from[0], from[1], limit);
  const ids = [...straight.keys()];
  if (ids.length === 0) return result;
  const positions = repository.stopPositions(ids);
  const routed = walker.distances(from, ids.map((id) => positions.get(id) ?? from), limit);
  ids.forEach((id, i) => {
    const walk = routed[i];
    if (walk == null) return;
    // Shorter than the straight line: both ends snapped onto one path. Use the line.
    result.set(id, Math.round(Math.max(walk, straight.get(id) ?? 0)));
  });
  return result;
}

/**
 * Turns a stop area id or a map point into the platforms that count, each with its walk.
 * A stop area always includes same-named areas next to it (the feed often splits bus and tram).
 */
export function resolveEndpoint(repository: TimetableRepository, id: string, options: EndpointOptions): Endpoint {
  const { board } = config;
  const walker = options.walker ?? null;
  const limit = endpointWalkLimit(id, options);
  const point = parsePointId(id);
  if (point) {
    // Named after the nearest stop, even when walking is off.
    const nearest = repository.nearestArea(point.lat, point.lon, POINT_NAME_METERS);
    const area: Area = {
      id,
      name: nearest ? `Bij ${nearest.name}` : "Punt op de kaart",
      lat: point.lat,
      lon: point.lon,
      departures: 0,
    };
    return { area, kind: "point", walkMeters: platformsWithinWalk(repository, [point.lat, point.lon], limit, walker) };
  }

  const area = repository.getArea(id);
  if (!area) throw new UnknownAreaError(id);
  const walkMeters = new Map<string, number>();
  if (limit > 0) {
    for (const [stopId, meters] of platformsWithinWalk(repository, [area.lat, area.lon], limit, walker)) {
      // A nearby platform is never free: count at least a short walk so the chosen stop wins ties.
      walkMeters.set(stopId, Math.max(meters, 1));
    }
  }
  for (const stopId of repository.stopIdsInAreas(repository.sameStopAreaIds(area, board.sameStopMeters))) {
    walkMeters.set(stopId, 0);
  }
  return { area, kind: "area", walkMeters };
}

/**
 * A platform cannot be both where you board and where you get off. A platform of the chosen
 * stop beats a merely nearby one; between two nearby claims the shorter walk wins, origin on a tie.
 */
export function splitSharedPlatforms(origin: Endpoint, destination: Endpoint): void {
  for (const [stopId, toOrigin] of origin.walkMeters) {
    const toDestination = destination.walkMeters.get(stopId);
    if (toDestination === undefined) continue;
    if (toDestination < toOrigin) origin.walkMeters.delete(stopId);
    else destination.walkMeters.delete(stopId);
  }
}

/** How far back to look so a delayed vehicle that should already have left still shows up. */
export const LATE_DEPARTURE_GRACE_SECONDS = 20 * 60;

export async function getBoard(
  repository: TimetableRepository,
  realtime: RealtimeSource | null,
  request: BoardRequest,
): Promise<Board> {
  const { board } = config;
  const endpoint = { walking: request.includeWalking, maxWalkMeters: request.maxWalkMeters, walker: request.walker };
  const origin = resolveEndpoint(repository, request.originId, { ...endpoint, role: "from" });
  const destination = resolveEndpoint(repository, request.destinationId, { ...endpoint, role: "to" });
  splitSharedPlatforms(origin, destination);
  const originStops = [...origin.walkMeters.keys()];
  const destinationStops = [...destination.walkMeters.keys()];

  const nowSeconds = Math.floor(request.now.getTime() / 1000);
  const from = nowSeconds - LATE_DEPARTURE_GRACE_SECONDS;
  const until = nowSeconds + board.horizonSeconds;

  // Trips after midnight still belong to yesterday's service day (GTFS times run past 24:00).
  const today = localServiceDate(request.now.getTime());
  const candidates = [shiftServiceDate(today, -1), today].flatMap((serviceDate) =>
    repository.findCandidates(originStops, destinationStops, serviceDate, from, until),
  );
  const trips = pickBestPairPerTrip(
    candidates.filter((candidate) => request.modes.has(candidate.mode)),
    origin.walkMeters,
    destination.walkMeters,
    request.walkTieSeconds,
  );

  const snapshot = realtime ? await realtime.snapshot() : null;
  const stopInfo = repository.stopInfo([...new Set(trips.flatMap((trip) => [trip.fromStopId, trip.toStopId]))]);

  const departures = rankDepartures(
    trips
      .map((trip) =>
        toDeparture(
          trip,
          stopInfo,
          snapshot?.adjustmentFor(trip) ?? null,
          origin.walkMeters,
          destination.walkMeters,
          nowSeconds,
        ),
      )
      // The grace window pulled in vehicles that really have left; drop those again.
      .filter((departure) => departure.expectedDeparture >= nowSeconds - 30),
  ).slice(0, board.maxDepartures);

  return {
    origin: { ...origin.area, kind: origin.kind },
    destination: { ...destination.area, kind: destination.kind },
    generatedAt: nowSeconds,
    realtime: realtime === null ? "disabled" : snapshot === null ? "unavailable" : "live",
    walkIncluded: request.includeWalking,
    summary: summarise(departures, nowSeconds),
    departures,
    alerts: await boardAlerts(request.alerts ?? null, trips, origin, destination, nowSeconds),
    // Only worth the search when no direct ride is any use.
    transfers: departures.some((departure) => !departure.cancelled && departure.catchable)
      ? []
      : findTransfers(repository, {
          origin,
          destination,
          serviceDates: [shiftServiceDate(today, -1), today],
          modes: request.modes,
          fromEpoch: from,
          untilEpoch: until,
          nowSeconds,
          snapshot,
        }),
  };
}

/** Alerts about the lines on this board, or about the stops where you get on and off. */
async function boardAlerts(
  source: AlertSource | null,
  trips: Candidate[],
  origin: Endpoint,
  destination: Endpoint,
  nowSeconds: number,
): Promise<Board["alerts"]> {
  const alerts = source ? await source.alerts() : null;
  if (!alerts) return [];
  const routeIds = new Set(trips.map((trip) => trip.routeId));
  const stopIds = new Set([...origin.walkMeters.keys(), ...destination.walkMeters.keys()]);
  return matchAlerts(alerts, routeIds, stopIds, nowSeconds);
}

export interface StopBoardRequest {
  stopId: string;
  /** Optional: mark the departures that also reach this place. */
  destinationId: string | null;
  includeWalking: boolean;
  modes: ReadonlySet<Mode>;
  now: Date;
  horizonSeconds: number;
  limit: number;
  maxWalkMeters?: number;
  /** Optional: where the traveller sets off, to tell them how far each pole is. */
  originId?: string | null;
  walker?: Walker | null;
}

/** Poles further than this from the origin get no walking time: you would not walk there. */
const MAX_POLE_WALK_METERS = 3000;
/** Stops this close together are one pole (the feed often lists a pole once per operator). */
const SAME_POLE_METERS = 15;

/**
 * The poles of a stop that have departures, each with a label, the direction its buses go and,
 * with an origin, the walk to it. Labels are the feed's platform codes when every pole has its
 * own; otherwise A, B, C… in a fixed order. Also returns, for every stop id, the pole it belongs to.
 */
function describePoles(
  repository: TimetableRepository,
  rows: StopDepartureRow[],
  stopName: string,
  origin: Endpoint | null,
  walker: Walker | null,
): { poles: StopPole[]; poleOf: Map<string, string> } {
  const allIds = [...new Set(rows.map((row) => row.stopId))].sort();
  const positions = repository.stopPositions(allIds);
  // Merge stops on the same spot into the first of them.
  const poleOf = new Map<string, string>();
  const ids: string[] = [];
  for (const id of allIds) {
    const [lat, lon] = positions.get(id) ?? [0, 0];
    const same = ids.find((other) => {
      const [oLat, oLon] = positions.get(other) ?? [0, 0];
      return distanceMeters(lat, lon, oLat, oLon) <= SAME_POLE_METERS;
    });
    poleOf.set(id, same ?? id);
    if (!same) ids.push(id);
  }
  const info = repository.stopInfo(ids);
  const platforms = ids.map((id) => info.get(id)?.platform ?? "");
  const usePlatforms = platforms.every(Boolean) && new Set(platforms).size === platforms.length;

  const walks = new Map<string, number>();
  if (origin) {
    const from: [number, number] = [origin.area.lat, origin.area.lon];
    const away = ids.filter((id) => origin.walkMeters.get(id) !== 0);
    const routed = walker
      ? walker.distances(from, away.map((id) => positions.get(id) ?? from), MAX_POLE_WALK_METERS)
      : [];
    away.forEach((id, i) => {
      const [lat, lon] = positions.get(id) ?? from;
      const line = distanceMeters(from[0], from[1], lat, lon);
      const meters = routed[i] != null ? Math.max(routed[i] as number, line) : line * STRAIGHT_LINE_DETOUR;
      if (meters <= MAX_POLE_WALK_METERS) walks.set(id, Math.round(meters));
    });
    for (const id of allIds) if (origin.walkMeters.get(id) === 0) walks.set(poleOf.get(id) ?? id, 0);
  }

  const poles = ids.map((id, i) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (poleOf.get(row.stopId) === id && row.nextStop) counts.set(row.nextStop, (counts.get(row.nextStop) ?? 0) + 1);
    }
    const towards = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const [lat, lon] = positions.get(id) ?? [0, 0];
    const walk = walks.get(id);
    return {
      id,
      label: usePlatforms ? (platforms[i] as string) : String.fromCharCode(65 + (i % 26)),
      lat,
      lon,
      towards: towards ? shortHeadsign(towards, stopName) : null,
      walkMeters: walk ?? null,
      walkSeconds: walk === undefined ? null : Math.round(walk * WALK_SECONDS_PER_METER),
    };
  });
  poles.sort((a, b) => a.label.localeCompare(b.label, "nl", { numeric: true }));
  return { poles, poleOf };
}

/** Everything leaving one stop soon, every line, as a departure board for the map. */
export async function getStopBoard(
  repository: TimetableRepository,
  realtime: RealtimeSource | null,
  request: StopBoardRequest,
): Promise<StopBoard> {
  const stop = resolveEndpoint(repository, request.stopId, { walking: false, role: "from" });
  const origin =
    request.originId && request.originId !== request.stopId
      ? resolveEndpoint(repository, request.originId, { walking: false, role: "from" })
      : null;
  const destination = request.destinationId
    ? resolveEndpoint(repository, request.destinationId, {
        walking: request.includeWalking,
        role: "to",
        maxWalkMeters: request.maxWalkMeters,
        walker: request.walker,
      })
    : null;
  if (destination) splitSharedPlatforms(stop, destination);
  const stopIds = [...stop.walkMeters.keys()];

  const nowSeconds = Math.floor(request.now.getTime() / 1000);
  const from = nowSeconds - LATE_DEPARTURE_GRACE_SECONDS;
  const until = nowSeconds + request.horizonSeconds;
  const today = localServiceDate(request.now.getTime());
  const serviceDates = [shiftServiceDate(today, -1), today];

  const rows = serviceDates
    .flatMap((serviceDate) => repository.departuresFrom(stopIds, serviceDate, from, until))
    .filter((row) => request.modes.has(row.mode));

  const reaching = new Set<string>();
  if (destination) {
    const destinationStops = [...destination.walkMeters.keys()];
    for (const serviceDate of serviceDates) {
      for (const candidate of repository.findCandidates(stopIds, destinationStops, serviceDate, from, until)) {
        reaching.add(`${candidate.serviceDate}|${candidate.tripId}|${candidate.fromSeq}`);
      }
    }
  }

  const snapshot = realtime ? await realtime.snapshot() : null;
  const departures: StopDeparture[] = rows
    .map((row) => {
      const adjustment = snapshot?.departureAt(row.tripId, row.serviceDate, row.seq, row.stopId, row.planned) ?? null;
      return {
        tripId: row.tripId,
        line: row.line,
        mode: row.mode,
        headsign: row.headsign,
        platform: row.platform,
        plannedDeparture: row.planned,
        expectedDeparture: row.planned + (adjustment?.delay ?? 0),
        cancelled: adjustment?.cancelled ?? false,
        toDestination: reaching.has(`${row.serviceDate}|${row.tripId}|${row.seq}`),
        poleId: row.stopId,
      };
    })
    .filter((departure) => departure.expectedDeparture >= nowSeconds - 30)
    .sort((a, b) => a.expectedDeparture - b.expectedDeparture || a.line.localeCompare(b.line, "nl", { numeric: true }))
    .slice(0, request.limit);

  const shown = new Set(departures.map((departure) => departure.poleId));
  const { poles, poleOf } = describePoles(
    repository,
    rows.filter((row) => shown.has(row.stopId)),
    stop.area.name,
    origin,
    request.walker ?? null,
  );

  return {
    stop: { id: stop.area.id, name: stop.area.name },
    generatedAt: nowSeconds,
    realtime: realtime === null ? "disabled" : snapshot === null ? "unavailable" : "live",
    destination: destination ? { id: destination.area.id, name: destination.area.name } : null,
    poles,
    departures: departures.map((departure) => ({ ...departure, poleId: poleOf.get(departure.poleId) ?? departure.poleId })),
  };
}
