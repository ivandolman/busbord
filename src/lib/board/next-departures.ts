import type { Walker } from "../roads/walking";
import { localServiceDate, shiftServiceDate } from "../time";
import type { RealtimeSource } from "./realtime";
import type { TimetableRepository } from "./repository";
import { LATE_DEPARTURE_GRACE_SECONDS, resolveEndpoint } from "./service";
import type { Mode, NextDeparture, NextDepartures } from "./types";

export interface NextDeparturesRequest {
  areaIds: string[];
  destinationId: string;
  includeWalking: boolean;
  modes: ReadonlySet<Mode>;
  now: Date;
  horizonSeconds: number;
  walker?: Walker | null;
  maxWalkMeters?: number;
}

/**
 * For each of a set of stop areas, the next ride of every line that goes from there to the
 * destination (so only the departures in the right direction). Used to put times on the map.
 */
export async function getNextDepartures(
  repository: TimetableRepository,
  realtime: RealtimeSource | null,
  request: NextDeparturesRequest,
): Promise<NextDepartures> {
  const nowSeconds = Math.floor(request.now.getTime() / 1000);
  const destination = resolveEndpoint(repository, request.destinationId, {
    walking: request.includeWalking,
    role: "to",
    maxWalkMeters: request.maxWalkMeters,
    walker: request.walker,
  });
  // A platform where you get off is not one to board towards the same place.
  const areaOf = new Map<string, string>();
  for (const areaId of request.areaIds) {
    for (const stopId of repository.stopIdsInAreas([areaId])) areaOf.set(stopId, areaId);
  }
  for (const stopId of destination.walkMeters.keys()) areaOf.delete(stopId);
  const areas: Record<string, NextDeparture[]> = Object.fromEntries(request.areaIds.map((id) => [id, []]));
  if (areaOf.size === 0) return { generatedAt: nowSeconds, areas };

  const from = nowSeconds - LATE_DEPARTURE_GRACE_SECONDS;
  const until = nowSeconds + request.horizonSeconds;
  const today = localServiceDate(request.now.getTime());
  const candidates = [shiftServiceDate(today, -1), today].flatMap((serviceDate) =>
    repository.findCandidates([...areaOf.keys()], [...destination.walkMeters.keys()], serviceDate, from, until),
  );
  const snapshot = realtime ? await realtime.snapshot() : null;

  const best = new Map<string, NextDeparture>();
  for (const candidate of candidates) {
    if (!request.modes.has(candidate.mode)) continue;
    const adjustment = snapshot?.adjustmentFor(candidate) ?? null;
    if (adjustment?.cancelled) continue;
    const expected = candidate.plannedDeparture + (adjustment?.departureDelay ?? 0);
    if (expected < nowSeconds - 30) continue;
    const areaId = areaOf.get(candidate.fromStopId);
    if (!areaId) continue;
    const key = `${areaId}|${candidate.mode}|${candidate.line}`;
    const current = best.get(key);
    if (!current || expected < current.expectedDeparture) {
      best.set(key, { line: candidate.line, mode: candidate.mode, expectedDeparture: expected });
    }
  }
  for (const [key, departure] of best) areas[key.slice(0, key.indexOf("|"))]?.push(departure);
  for (const list of Object.values(areas)) list.sort((a, b) => a.expectedDeparture - b.expectedDeparture);
  return { generatedAt: nowSeconds, areas };
}
