import type { DatabaseSync } from "node:sqlite";

/** One distinct stopping pattern of a route, with a trip that runs it (to look up its shape). */
export interface LinePattern {
  routeId: string;
  tripId: string;
  trips: number;
  stopIds: string[];
}

type LatLon = [lat: number, lon: number];

/**
 * Distinct stopping patterns per route, enough to draw every route once. A pattern whose stops
 * are all covered by longer patterns of the same route (short runs, the opposite direction) is
 * dropped. One ordered pass over stop_times: about two seconds on the Utrecht region.
 */
export function computeLinePatterns(db: DatabaseSync): LinePattern[] {
  const rows = db
    .prepare(
      `SELECT st.trip_id AS tripId, st.stop_id AS stopId, t.route_id AS routeId
         FROM stop_times st JOIN trips t ON t.trip_id = st.trip_id
        ORDER BY st.trip_id, st.seq`,
    )
    .iterate() as Iterable<{ tripId: string; stopId: string; routeId: string }>;

  const bySignature = new Map<string, LinePattern>();
  type Trip = { tripId: string; routeId: string; stopIds: string[] };
  let current = null as Trip | null;
  const flush = () => {
    if (!current || current.stopIds.length < 2) return;
    const signature = `${current.routeId}\u0001${current.stopIds.join("\u0002")}`;
    const pattern = bySignature.get(signature);
    if (pattern) pattern.trips++;
    else bySignature.set(signature, { routeId: current.routeId, tripId: current.tripId, trips: 1, stopIds: current.stopIds });
  };
  for (const row of rows) {
    if (current?.tripId !== row.tripId) {
      flush();
      current = { tripId: row.tripId, routeId: row.routeId, stopIds: [] };
    }
    current.stopIds.push(row.stopId);
  }
  flush();

  const byRoute = new Map<string, LinePattern[]>();
  for (const pattern of bySignature.values()) {
    const list = byRoute.get(pattern.routeId) ?? [];
    list.push(pattern);
    byRoute.set(pattern.routeId, list);
  }

  const kept: LinePattern[] = [];
  for (const patterns of byRoute.values()) {
    patterns.sort((a, b) => b.stopIds.length - a.stopIds.length || b.trips - a.trips);
    const covered = new Set<string>();
    for (const pattern of patterns) {
      if (pattern.stopIds.every((stopId) => covered.has(stopId))) continue;
      for (const stopId of pattern.stopIds) covered.add(stopId);
      kept.push(pattern);
    }
  }
  return kept;
}

const METERS_PER_DEGREE = 111_320;

function squaredDistance(a: LatLon, b: LatLon, cosLat: number): number {
  const dy = (a[0] - b[0]) * METERS_PER_DEGREE;
  const dx = (a[1] - b[1]) * METERS_PER_DEGREE * cosLat;
  return dx * dx + dy * dy;
}

/** Squared distance in metres from p to segment a-b, on a local flat projection. */
function squaredSegmentDistance(p: LatLon, a: LatLon, b: LatLon, cosLat: number): number {
  const ax = a[1] * cosLat;
  const bx = b[1] * cosLat;
  const px = p[1] * cosLat;
  const dx = bx - ax;
  const dy = b[0] - a[0];
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (p[0] - a[0]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const ex = (px - (ax + t * dx)) * METERS_PER_DEGREE;
  const ey = (p[0] - (a[0] + t * dy)) * METERS_PER_DEGREE;
  return ex * ex + ey * ey;
}

/** Douglas-Peucker, iterative so long shapes cannot overflow the stack. Rounds to ~1 m. */
export function simplifyPath(points: LatLon[], toleranceMeters: number): LatLon[] {
  if (points.length <= 2) return points.map(roundPoint);
  const cosLat = Math.cos(((points[0]?.[0] ?? 52) * Math.PI) / 180);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  const tolerance = toleranceMeters * toleranceMeters;
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const distance = squaredSegmentDistance(points[i] as LatLon, points[first] as LatLon, points[last] as LatLon, cosLat);
      if (distance > worstDistance) {
        worst = i;
        worstDistance = distance;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1).map(roundPoint);
}

const roundPoint = ([lat, lon]: LatLon): LatLon => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5];

/**
 * Cuts a full trip shape down to the part between the first and last stop we kept, since trips
 * that leave the region carry their whole route along.
 */
export function clipShape(shape: LatLon[], first: LatLon, last: LatLon): LatLon[] {
  if (shape.length < 2) return shape;
  const cosLat = Math.cos((first[0] * Math.PI) / 180);
  const nearest = (target: LatLon, from: number) => {
    let best = from;
    let bestDistance = Infinity;
    for (let i = from; i < shape.length; i++) {
      const distance = squaredDistance(shape[i] as LatLon, target, cosLat);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    return best;
  };
  const start = nearest(first, 0);
  const end = nearest(last, start);
  return end > start ? shape.slice(start, end + 1) : shape;
}
