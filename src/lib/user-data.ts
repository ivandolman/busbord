import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { minutesToWalkMeters } from "./board/build-board";
import { config } from "./config";
import { MAX_ROUTES, parseSavedRoutes, type SavedRoute } from "./saved-routes";

/** What the traveller can tune. Stored next to the saved routes. */
export interface Settings {
  /** Prefer the stops with less walking while the trip takes at most this many minutes longer. */
  walkTieMinutes: number;
  /** Map background: a quiet grey map, or the detailed OpenStreetMap one. */
  mapStyle: MapStyle;
  /** The longest walk to (or from) a stop that still counts. */
  maxWalkMinutes: number;
}

export type MapStyle = "calm" | "detailed";

export const DEFAULT_SETTINGS: Settings = {
  walkTieMinutes: 2,
  mapStyle: "calm",
  maxWalkMinutes: config.board.defaultMaxWalkMinutes,
};
export const MIN_MAX_WALK_MINUTES = 2;
export const MAX_MAX_WALK_MINUTES = 25;

export function parseMaxWalkMinutes(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isInteger(number) && number >= MIN_MAX_WALK_MINUTES && number <= MAX_MAX_WALK_MINUTES
    ? number
    : null;
}

export function parseMapStyle(value: unknown): MapStyle | null {
  return value === "calm" || value === "detailed" ? value : null;
}

/**
 * The settings in a request body that are valid; null when one present is invalid. Missing
 * settings are left out, so a client can change one at a time.
 */
export function parseSettingsUpdate(body: unknown): Partial<Settings> | null {
  if (typeof body !== "object" || body === null) return null;
  const input = body as Record<string, unknown>;
  const update: Partial<Settings> = {};
  if (input.walkTieMinutes !== undefined) {
    const minutes = parseWalkTieMinutes(input.walkTieMinutes);
    if (minutes === null) return null;
    update.walkTieMinutes = minutes;
  }
  if (input.maxWalkMinutes !== undefined) {
    const minutes = parseMaxWalkMinutes(input.maxWalkMinutes);
    if (minutes === null) return null;
    update.maxWalkMinutes = minutes;
  }
  if (input.mapStyle !== undefined) {
    const style = parseMapStyle(input.mapStyle);
    if (style === null) return null;
    update.mapStyle = style;
  }
  return update;
}
export const MAX_WALK_TIE_MINUTES = 15;

/** A whole number of minutes within range, or null. */
export function parseWalkTieMinutes(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isInteger(number) && number >= 0 && number <= MAX_WALK_TIE_MINUTES
    ? number
    : null;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS saved_routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    from_id TEXT NOT NULL,
    from_name TEXT NOT NULL,
    to_id TEXT NOT NULL,
    to_name TEXT NOT NULL,
    walk INTEGER NOT NULL,
    saved_at INTEGER NOT NULL,
    schedule TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS saved_routes_pair ON saved_routes (from_id, to_id);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

type RouteRow = {
  id: string;
  name: string;
  from_id: string;
  from_name: string;
  to_id: string;
  to_name: string;
  walk: number;
  saved_at: number;
  schedule: string | null;
};

/**
 * Saved routes and settings in their own SQLite file. Single user: whoever can reach the app
 * shares one list, which is what a personal board on your own machine wants.
 */
export class UserStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(SCHEMA);
  }

  /** Newest first. */
  routes(): SavedRoute[] {
    const rows = this.db.prepare("SELECT * FROM saved_routes ORDER BY saved_at DESC, id").all() as unknown as RouteRow[];
    // Through the same parser as any other input, so a hand-edited row cannot break the app.
    return parseSavedRoutes(
      JSON.stringify(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          from: { id: row.from_id, name: row.from_name },
          to: { id: row.to_id, name: row.to_name },
          walk: row.walk === 1,
          savedAt: row.saved_at,
          schedule: row.schedule ? (JSON.parse(row.schedule) as unknown) : null,
        })),
      ),
    );
  }

  /** Adds or replaces a route. Saving the same trip under another id replaces that one. */
  saveRoute(route: SavedRoute): SavedRoute[] {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM saved_routes WHERE from_id = ? AND to_id = ? AND id <> ?").run(route.from.id, route.to.id, route.id);
      this.db
        .prepare(
          `INSERT INTO saved_routes (id, name, from_id, from_name, to_id, to_name, walk, saved_at, schedule)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET name = excluded.name, from_id = excluded.from_id,
             from_name = excluded.from_name, to_id = excluded.to_id, to_name = excluded.to_name,
             walk = excluded.walk, saved_at = excluded.saved_at, schedule = excluded.schedule`,
        )
        .run(
          route.id,
          route.name,
          route.from.id,
          route.from.name,
          route.to.id,
          route.to.name,
          route.walk ? 1 : 0,
          route.savedAt,
          route.schedule ? JSON.stringify(route.schedule) : null,
        );
      // Keep the list bounded: the oldest go first.
      this.db
        .prepare(
          "DELETE FROM saved_routes WHERE id NOT IN (SELECT id FROM saved_routes ORDER BY saved_at DESC, id LIMIT ?)",
        )
        .run(MAX_ROUTES);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.routes();
  }

  deleteRoute(id: string): SavedRoute[] {
    this.db.prepare("DELETE FROM saved_routes WHERE id = ?").run(id);
    return this.routes();
  }

  settings(): Settings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as unknown as { key: string; value: string }[];
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    return {
      walkTieMinutes: parseWalkTieMinutes(stored.get("walkTieMinutes")) ?? DEFAULT_SETTINGS.walkTieMinutes,
      mapStyle: parseMapStyle(stored.get("mapStyle")) ?? DEFAULT_SETTINGS.mapStyle,
      maxWalkMinutes: parseMaxWalkMinutes(stored.get("maxWalkMinutes")) ?? DEFAULT_SETTINGS.maxWalkMinutes,
    };
  }

  /** Stores the given settings; the others keep their value. */
  saveSettings(update: Partial<Settings>): Settings {
    const statement = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    );
    for (const [key, value] of Object.entries(update)) statement.run(key, String(value));
    return this.settings();
  }
}

let store: UserStore | null = null;

export function getUserStore(): UserStore {
  if (!store) {
    mkdirSync(dirname(config.userDbPath), { recursive: true });
    store = new UserStore(new DatabaseSync(config.userDbPath));
  }
  return store;
}

/**
 * The walking tie for a request: the `tie` query parameter (minutes) when given, which also keeps
 * cached responses apart per setting, else the stored setting.
 */
export function walkTieSeconds(param: string | null): number {
  const minutes = parseWalkTieMinutes(param) ?? getUserStore().settings().walkTieMinutes;
  return minutes * 60;
}

/** The longest walk for a request in metres: the `maxWalk` query parameter (minutes) or the stored setting. */
export function maxWalkMeters(param: string | null): number {
  const minutes = parseMaxWalkMinutes(param) ?? getUserStore().settings().maxWalkMinutes;
  return minutesToWalkMeters(minutes);
}
