import type { DatabaseSync } from "node:sqlite";
import { boxAround, distanceMeters, normaliseForSearch } from "../geo";
import { serviceDayStart } from "../time";
import { modeFromRouteType } from "./build-board";
import { stopNameKey } from "../stop-name";
import type { Area, Candidate, Mode, StopInfo } from "./types";

export interface StopDepartureRow {
  tripId: string;
  serviceDate: string;
  stopId: string;
  seq: number;
  /** Epoch seconds. */
  planned: number;
  headsign: string;
  line: string;
  mode: Mode;
  platform: string;
  /** Name of the stop this trip calls at next: tells the two sides of a street apart. */
  nextStop: string;
}

interface AreaRow {
  id: string;
  name: string;
  lat: number;
  lon: number;
  departures: number;
}

interface CandidateRow {
  tripId: string;
  routeId: string;
  fromStopId: string;
  fromSeq: number;
  dep: number;
  toStopId: string;
  toSeq: number;
  arr: number;
  headsign: string;
  line: string;
  routeType: number;
}

const AREA_COLUMNS = "area_id AS id, name, lat, lon, departures";
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * All timetable reads. Every value reaches SQLite as a bound parameter; lists travel as one JSON
 * parameter (json_each), so no SQL is ever assembled from request input.
 */
export class TimetableRepository {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Stops matching every word, busiest first. A stop that the feed splits into several areas
   * with the same name (bus and tram side) is listed once, under its busiest area.
   */
  searchAreas(query: string, limit: number, sameStopMeters = 0): Area[] {
    const tokens = normaliseForSearch(query).split(" ").filter(Boolean).slice(0, 6);
    if (tokens.length === 0) return [];
    const where = tokens.map(() => "search_name LIKE ? ESCAPE '\\'").join(" AND ");
    const rows = this.db
      .prepare(`SELECT ${AREA_COLUMNS} FROM areas WHERE ${where} AND departures > 0 ORDER BY departures DESC LIMIT ?`)
      .all(...tokens.map((token) => `%${escapeLike(token)}%`), limit * 4) as unknown as AreaRow[];
    const kept: Area[] = [];
    for (const row of rows) {
      const duplicate = kept.some(
        (area) => stopNameKey(area.name) === stopNameKey(row.name) && distanceMeters(area.lat, area.lon, row.lat, row.lon) <= sameStopMeters,
      );
      if (!duplicate) kept.push({ ...row });
      if (kept.length >= limit) break;
    }
    return kept;
  }

  getArea(areaId: string): Area | null {
    const row = this.db.prepare(`SELECT ${AREA_COLUMNS} FROM areas WHERE area_id = ?`).get(areaId) as
      | AreaRow
      | undefined;
    return row ? { ...row } : null;
  }

  /** The area plus areas with the same name (see stopNameKey) close by: what a traveller calls one stop. */
  sameStopAreaIds(area: Area, meters: number): string[] {
    const ids = new Set([area.id]);
    if (meters <= 0) return [...ids];
    const { dLat, dLon } = boxAround(area.lat, meters);
    const rows = this.db
      .prepare("SELECT area_id AS id, name, lat, lon FROM areas WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?")
      .all(area.lat - dLat, area.lat + dLat, area.lon - dLon, area.lon + dLon) as unknown as {
      id: string;
      name: string;
      lat: number;
      lon: number;
    }[];
    const key = stopNameKey(area.name);
    for (const row of rows) {
      if (stopNameKey(row.name) === key && distanceMeters(area.lat, area.lon, row.lat, row.lon) <= meters) ids.add(row.id);
    }
    return [...ids];
  }

  areasByIds(areaIds: string[]): Area[] {
    const rows = this.db
      .prepare(`SELECT ${AREA_COLUMNS} FROM areas WHERE area_id IN (SELECT value FROM json_each(?))`)
      .all(JSON.stringify(areaIds)) as unknown as AreaRow[];
    return rows.map((row) => ({ ...row }));
  }

  /** The stop areas these platforms belong to. */
  areasOfStops(stopIds: string[]): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT area_id AS id FROM stops WHERE stop_id IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify(stopIds)) as unknown as { id: string }[];
    return rows.map((row) => row.id);
  }

  stopIdsInAreas(areaIds: string[]): string[] {
    const rows = this.db
      .prepare("SELECT stop_id AS id FROM stops WHERE area_id IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify(areaIds)) as unknown as { id: string }[];
    return rows.map((row) => row.id);
  }

  /** Platforms within `meters` of a point, as the crow flies, with their distance. */
  stopsNear(lat: number, lon: number, meters: number): Map<string, number> {
    const { dLat, dLon } = boxAround(lat, meters);
    const rows = this.db
      .prepare("SELECT stop_id AS id, lat, lon FROM stops WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?")
      .all(lat - dLat, lat + dLat, lon - dLon, lon + dLon) as unknown as { id: string; lat: number; lon: number }[];
    const result = new Map<string, number>();
    for (const stop of rows) {
      const distance = distanceMeters(lat, lon, stop.lat, stop.lon);
      if (distance <= meters) result.set(stop.id, Math.round(distance));
    }
    return result;
  }

  /** The busiest-named stop area closest to a point, used to give a map point a readable name. */
  nearestArea(lat: number, lon: number, meters: number): Area | null {
    const { dLat, dLon } = boxAround(lat, meters);
    const rows = this.db
      .prepare(
        `SELECT ${AREA_COLUMNS} FROM areas WHERE departures > 0 AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
      )
      .all(lat - dLat, lat + dLat, lon - dLon, lon + dLon) as unknown as AreaRow[];
    let best: { area: Area; distance: number } | null = null;
    for (const row of rows) {
      const distance = distanceMeters(lat, lon, row.lat, row.lon);
      if (distance <= meters && (!best || distance < best.distance)) best = { area: { ...row }, distance };
    }
    return best?.area ?? null;
  }

  /**
   * Every stop area and route from which the given platforms are reached without changing on a
   * service date: the mirror image of `reachableFrom`.
   */
  reachingTo(destinationStopIds: string[], serviceDate: string): { areaId: string; routeId: string; routeType: number }[] {
    return this.db
      .prepare(
        `SELECT DISTINCT s.area_id AS areaId, t.route_id AS routeId, r.type AS routeType
           FROM stop_times d
           JOIN trips t ON t.trip_id = d.trip_id
           JOIN service_dates sd ON sd.service_id = t.service_id AND sd.date = ?
           JOIN routes r ON r.route_id = t.route_id
           JOIN stop_times o ON o.trip_id = d.trip_id AND o.seq < d.seq AND o.pickup = 1
           JOIN stops s ON s.stop_id = o.stop_id
          WHERE d.stop_id IN (SELECT value FROM json_each(?))
            AND d.dropoff = 1`,
      )
      .all(serviceDate, JSON.stringify(destinationStopIds)) as unknown as {
      areaId: string;
      routeId: string;
      routeType: number;
    }[];
  }

  /**
   * Every stop area and route reachable without changing from the given platforms on a service
   * date, for the map. Route types are returned so the caller can leave out trains.
   */
  reachableFrom(originStopIds: string[], serviceDate: string): { areaId: string; routeId: string; routeType: number }[] {
    return this.db
      .prepare(
        `SELECT DISTINCT s.area_id AS areaId, t.route_id AS routeId, r.type AS routeType
           FROM stop_times o
           JOIN trips t ON t.trip_id = o.trip_id
           JOIN service_dates sd ON sd.service_id = t.service_id AND sd.date = ?
           JOIN routes r ON r.route_id = t.route_id
           JOIN stop_times d ON d.trip_id = o.trip_id AND d.seq > o.seq AND d.dropoff = 1
           JOIN stops s ON s.stop_id = d.stop_id
          WHERE o.stop_id IN (SELECT value FROM json_each(?))
            AND o.pickup = 1`,
      )
      .all(serviceDate, JSON.stringify(originStopIds)) as unknown as {
      areaId: string;
      routeId: string;
      routeType: number;
    }[];
  }

  /**
   * Trips running on `serviceDate` that call at an origin platform between the two epoch times
   * and at a destination platform further down the same trip.
   */
  findCandidates(
    originStopIds: string[],
    destinationStopIds: string[],
    serviceDate: string,
    fromEpoch: number,
    untilEpoch: number,
  ): Candidate[] {
    const dayStart = serviceDayStart(serviceDate);
    const rows = this.db
      .prepare(
        `SELECT o.trip_id AS tripId, t.route_id AS routeId, o.stop_id AS fromStopId, o.seq AS fromSeq, o.dep AS dep,
                d.stop_id AS toStopId, d.seq AS toSeq, d.arr AS arr,
                t.headsign AS headsign, r.short_name AS line, r.type AS routeType
           FROM stop_times o
           JOIN trips t ON t.trip_id = o.trip_id
           JOIN service_dates sd ON sd.service_id = t.service_id AND sd.date = ?
           JOIN routes r ON r.route_id = t.route_id
           JOIN stop_times d ON d.trip_id = o.trip_id AND d.seq > o.seq
          WHERE o.stop_id IN (SELECT value FROM json_each(?))
            AND o.dep BETWEEN ? AND ?
            AND o.pickup = 1
            AND d.stop_id IN (SELECT value FROM json_each(?))
            AND d.dropoff = 1`,
      )
      .all(
        serviceDate,
        JSON.stringify(originStopIds),
        fromEpoch - dayStart,
        untilEpoch - dayStart,
        JSON.stringify(destinationStopIds),
      ) as unknown as CandidateRow[];

    return rows.map((row) => ({
      tripId: row.tripId,
      routeId: row.routeId,
      serviceDate,
      line: row.line,
      mode: modeFromRouteType(row.routeType),
      headsign: row.headsign,
      fromStopId: row.fromStopId,
      fromSeq: row.fromSeq,
      toStopId: row.toStopId,
      toSeq: row.toSeq,
      plannedDeparture: dayStart + row.dep,
      plannedArrival: dayStart + row.arr,
    }));
  }

  /**
   * Departures from the given platforms between two epoch times on a service date. A trip's last
   * stop is left out: nobody boards there.
   */
  departuresFrom(stopIds: string[], serviceDate: string, fromEpoch: number, untilEpoch: number): StopDepartureRow[] {
    const dayStart = serviceDayStart(serviceDate);
    const rows = this.db
      .prepare(
        `SELECT o.trip_id AS tripId, o.stop_id AS stopId, o.seq AS seq, o.dep AS dep,
                t.headsign AS headsign, r.short_name AS line, r.type AS routeType, s.platform AS platform,
                (SELECT ns.name FROM stop_times n JOIN stops ns ON ns.stop_id = n.stop_id
                  WHERE n.trip_id = o.trip_id AND n.seq > o.seq ORDER BY n.seq LIMIT 1) AS nextStop
           FROM stop_times o
           JOIN trips t ON t.trip_id = o.trip_id
           JOIN service_dates sd ON sd.service_id = t.service_id AND sd.date = ?
           JOIN routes r ON r.route_id = t.route_id
           JOIN stops s ON s.stop_id = o.stop_id
          WHERE o.stop_id IN (SELECT value FROM json_each(?))
            AND o.dep BETWEEN ? AND ?
            AND o.pickup = 1
            AND EXISTS (SELECT 1 FROM stop_times n WHERE n.trip_id = o.trip_id AND n.seq > o.seq)`,
      )
      .all(serviceDate, JSON.stringify(stopIds), fromEpoch - dayStart, untilEpoch - dayStart) as unknown as {
      tripId: string;
      stopId: string;
      seq: number;
      dep: number;
      headsign: string;
      line: string;
      routeType: number;
      platform: string;
      nextStop: string | null;
    }[];
    return rows.map((row) => ({
      tripId: row.tripId,
      serviceDate,
      stopId: row.stopId,
      seq: row.seq,
      planned: dayStart + row.dep,
      headsign: row.headsign,
      line: row.line,
      mode: modeFromRouteType(row.routeType),
      platform: row.platform,
      nextStop: row.nextStop ?? "",
    }));
  }

  stopPositions(stopIds: string[]): Map<string, [number, number]> {
    const rows = this.db
      .prepare("SELECT stop_id AS id, lat, lon FROM stops WHERE stop_id IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify(stopIds)) as unknown as { id: string; lat: number; lon: number }[];
    return new Map(rows.map((row) => [row.id, [row.lat, row.lon]]));
  }

  stopInfo(stopIds: string[]): Map<string, StopInfo> {
    const rows = this.db
      .prepare("SELECT stop_id AS id, name, platform, lat, lon FROM stops WHERE stop_id IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify(stopIds)) as unknown as { id: string; name: string; platform: string; lat: number; lon: number }[];
    return new Map(rows.map((row) => [row.id, { name: row.name, platform: row.platform, lat: row.lat, lon: row.lon }]));
  }
}
