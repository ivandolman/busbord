import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { modeFromRouteType } from "../board/build-board";
import { config } from "../config";
import { distanceMeters } from "../geo";
import { stopNameKey } from "../stop-name";
import type { Mode } from "../board/types";
import { computeLinePatterns } from "./patterns";

export type LatLon = [lat: number, lon: number];

export interface NetworkLine {
  id: string;
  line: string;
  name: string;
  mode: Mode;
  /** "#rrggbb" from the feed, or null to colour by mode. */
  color: string | null;
  paths: LatLon[][];
}

/**
 * One stop as a traveller sees it: every stop area with this name close together (bus and tram
 * side, one per operator) drawn as one dot. `id` is the busiest of them.
 */
export interface NetworkStop {
  id: string;
  /** Every stop area in this stop, `id` first. */
  areaIds: string[];
  name: string;
  lat: number;
  lon: number;
  /** Indexes into `lines`. */
  lines: number[];
}

export interface Network {
  /** True when paths follow the road (shapes.txt); false when they connect stops in a straight line. */
  shaped: boolean;
  lines: NetworkLine[];
  stops: NetworkStop[];
}

/** Modes drawn on the map; trains are left out, as on the board. */
const MAP_MODES: ReadonlySet<Mode> = new Set<Mode>(["bus", "tram", "metro", "ferry"]);

export interface PatternRow {
  routeId: string;
  stopIds: string[];
  path: LatLon[] | null;
  color: string | null;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

/** Patterns stored by the importer, or (for a database imported before they existed) computed now. */
export function loadPatterns(db: DatabaseSync): PatternRow[] {
  if (hasTable(db, "line_patterns")) {
    const rows = db.prepare("SELECT route_id AS routeId, stop_ids AS stopIds, path, color FROM line_patterns").all() as unknown as {
      routeId: string;
      stopIds: string;
      path: string;
      color: string;
    }[];
    return rows.map((row) => ({
      routeId: row.routeId,
      stopIds: JSON.parse(row.stopIds) as string[],
      path: row.path ? (JSON.parse(row.path) as LatLon[]) : null,
      color: /^#[0-9a-f]{6}$/i.test(row.color) ? row.color : null,
    }));
  }
  return computeLinePatterns(db).map((pattern) => ({
    routeId: pattern.routeId,
    stopIds: pattern.stopIds,
    path: null,
    color: null,
  }));
}

export function buildNetwork(db: DatabaseSync): Network {
  const routes = db.prepare("SELECT route_id AS id, short_name AS line, long_name AS name, type FROM routes").all() as unknown as {
    id: string;
    line: string;
    name: string;
    type: number;
  }[];
  const stops = new Map(
    (
      db.prepare("SELECT stop_id AS id, area_id AS areaId, lat, lon FROM stops").all() as unknown as {
        id: string;
        areaId: string;
        lat: number;
        lon: number;
      }[]
    ).map((stop) => [stop.id, stop]),
  );

  const lines: NetworkLine[] = [];
  const lineIndex = new Map<string, number>();
  for (const route of routes) {
    const mode = modeFromRouteType(route.type);
    if (!MAP_MODES.has(mode)) continue;
    lineIndex.set(route.id, lines.length);
    lines.push({ id: route.id, line: route.line, name: route.name, mode, color: null, paths: [] });
  }

  const linesOfArea = new Map<string, Set<number>>();
  let shaped = false;
  for (const pattern of loadPatterns(db)) {
    const index = lineIndex.get(pattern.routeId);
    const line = index === undefined ? undefined : lines[index];
    if (index === undefined || !line) continue;
    if (pattern.color) line.color = pattern.color;

    const coordinates: LatLon[] = [];
    for (const stopId of pattern.stopIds) {
      const stop = stops.get(stopId);
      if (!stop) continue;
      coordinates.push([stop.lat, stop.lon]);
      const set = linesOfArea.get(stop.areaId) ?? new Set<number>();
      set.add(index);
      linesOfArea.set(stop.areaId, set);
    }
    if (pattern.path && pattern.path.length >= 2) {
      shaped = true;
      line.paths.push(pattern.path);
    } else if (coordinates.length >= 2) {
      line.paths.push(coordinates.map(([lat, lon]) => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]));
    }
  }

  const areas = db
    .prepare("SELECT area_id AS id, name, lat, lon FROM areas WHERE departures > 0 ORDER BY departures DESC, area_id")
    .all() as unknown as { id: string; name: string; lat: number; lon: number }[];
  // Busiest first, so each group is named after (and centred on) its main area.
  const groups: { first: (typeof areas)[number]; members: (typeof areas)[number][]; lines: Set<number> }[] = [];
  const groupsByName = new Map<string, typeof groups>();
  for (const area of areas) {
    const served = linesOfArea.get(area.id);
    if (!served) continue;
    const nameKey = stopNameKey(area.name);
    const sameName = groupsByName.get(nameKey) ?? [];
    let group = sameName.find(
      (candidate) =>
        distanceMeters(candidate.first.lat, candidate.first.lon, area.lat, area.lon) <= config.board.sameStopMeters,
    );
    if (!group) {
      group = { first: area, members: [], lines: new Set() };
      groups.push(group);
      sameName.push(group);
      groupsByName.set(nameKey, sameName);
    }
    group.members.push(area);
    for (const index of served) group.lines.add(index);
  }
  const networkStops: NetworkStop[] = groups.map(({ first, members, lines: served }) => {
    const lat = members.reduce((sum, member) => sum + member.lat, 0) / members.length;
    const lon = members.reduce((sum, member) => sum + member.lon, 0) / members.length;
    return {
      id: first.id,
      areaIds: members.map((member) => member.id),
      name: first.name,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      lines: [...served].sort((a, b) => a - b),
    };
  });

  // Lines stay in place even without a path: stops refer to them by index.
  return { shaped, lines, stops: networkStops };
}

const cache = new WeakMap<DatabaseSync, { json: string; etag: string }>();

/**
 * The whole network as JSON, built once per database handle. The handle is replaced when the
 * importer swaps the file, which drops this cache with it.
 */
export function getNetworkJson(db: DatabaseSync): { json: string; etag: string } {
  let entry = cache.get(db);
  if (entry === undefined) {
    const json = JSON.stringify(buildNetwork(db));
    entry = { json, etag: `"${createHash("sha1").update(json).digest("base64url")}"` };
    cache.set(db, entry);
  }
  return entry;
}
