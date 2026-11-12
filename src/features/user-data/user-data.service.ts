// Saved routes and settings in their own SQLite file, plus the per-request walking limits

import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { minutesToWalkMeters } from "@/features/board/build-board"
import { MAX_ROUTES, parseRouteList } from "@/features/saved-routes/saved-routes"
import type { SavedRoute } from "@/features/saved-routes/saved-routes.schema"
import { config } from "@/lib/config"

import {
    MapStyleSchema,
    MaxWalkMinutesSchema,
    SettingsUpdateSchema,
    WalkTieMinutesSchema,
    type MapStyle,
    type Settings,
} from "./user-data.schema"

// --- CONSTANTS ---

export {
    MAX_MAX_WALK_MINUTES,
    MAX_WALK_TIE_MINUTES,
    MIN_MAX_WALK_MINUTES,
} from "./user-data.schema"

export const DEFAULT_SETTINGS: Settings = {
    walkTieMinutes: 2,
    mapStyle: "calm",
    maxWalkMinutes: config.board.defaultMaxWalkMinutes,
}

const USER_TABLES = `
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
`

// --- INTERFACES ---

export type { MapStyle, Settings }

interface RouteRow {
    id: string
    name: string
    from_id: string
    from_name: string
    to_id: string
    to_name: string
    walk: number
    saved_at: number
    schedule: string | null
}

interface SettingRow {
    key: string
    value: string
}

export type UserDataService = ReturnType<typeof createUserDataService>

// --- HELPERS ---

/** A whole number of minutes within range, or null. */
export function parseWalkTieMinutes(value: unknown): number | null {
    return WalkTieMinutesSchema.safeParse(value).data ?? null
}

export function parseMaxWalkMinutes(value: unknown): number | null {
    return MaxWalkMinutesSchema.safeParse(value).data ?? null
}

export function parseMapStyle(value: unknown): MapStyle | null {
    return MapStyleSchema.safeParse(value).data ?? null
}

/** The settings in a request body that are valid; null when one present is invalid. */
export function parseSettingsUpdate(body: unknown): Partial<Settings> | null {
    return SettingsUpdateSchema.safeParse(body).data ?? null
}

// --- SERVICE ---

/**
 * Saved routes and settings. Single user: whoever can reach the app shares one list, which is
 * what a personal board on your own machine wants.
 */
export function createUserDataService(db: DatabaseSync) {
    db.exec("PRAGMA journal_mode = WAL")
    db.exec(USER_TABLES)

    /** Newest first. */
    function routes(): SavedRoute[] {
        const rows = db
            .prepare("SELECT * FROM saved_routes ORDER BY saved_at DESC, id")
            .all() as unknown as RouteRow[]
        // Through the same parser as any other input, so a hand-edited row cannot break the app.
        return parseRouteList(
            rows.map((row) => ({
                id: row.id,
                name: row.name,
                from: { id: row.from_id, name: row.from_name },
                to: { id: row.to_id, name: row.to_name },
                walk: row.walk === 1,
                savedAt: row.saved_at,
                schedule: row.schedule ? (JSON.parse(row.schedule) as unknown) : null,
            })),
        )
    }

    function settings(): Settings {
        const rows = db.prepare("SELECT key, value FROM settings").all() as unknown as SettingRow[]
        const stored = new Map(rows.map((row) => [row.key, row.value]))
        return {
            walkTieMinutes:
                parseWalkTieMinutes(stored.get("walkTieMinutes")) ??
                DEFAULT_SETTINGS.walkTieMinutes,
            mapStyle: parseMapStyle(stored.get("mapStyle")) ?? DEFAULT_SETTINGS.mapStyle,
            maxWalkMinutes:
                parseMaxWalkMinutes(stored.get("maxWalkMinutes")) ??
                DEFAULT_SETTINGS.maxWalkMinutes,
        }
    }

    return {
        routes,

        /** Adds or replaces a route. Saving the same trip under another id replaces that one. */
        saveRoute(route: SavedRoute): SavedRoute[] {
            db.exec("BEGIN")
            try {
                db.prepare(
                    "DELETE FROM saved_routes WHERE from_id = ? AND to_id = ? AND id <> ?",
                ).run(route.from.id, route.to.id, route.id)
                db.prepare(
                    `INSERT INTO saved_routes (id, name, from_id, from_name, to_id, to_name, walk, saved_at, schedule)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET name = excluded.name, from_id = excluded.from_id,
             from_name = excluded.from_name, to_id = excluded.to_id, to_name = excluded.to_name,
             walk = excluded.walk, saved_at = excluded.saved_at, schedule = excluded.schedule`,
                ).run(
                    route.id,
                    route.name,
                    route.from.id,
                    route.from.name,
                    route.to.id,
                    route.to.name,
                    route.walk ? 1 : 0,
                    route.savedAt,
                    route.schedule ? JSON.stringify(route.schedule) : null,
                )
                // Keep the list bounded: the oldest go first.
                db.prepare(
                    "DELETE FROM saved_routes WHERE id NOT IN (SELECT id FROM saved_routes ORDER BY saved_at DESC, id LIMIT ?)",
                ).run(MAX_ROUTES)
                db.exec("COMMIT")
            } catch (error) {
                db.exec("ROLLBACK")
                throw error
            }
            return routes()
        },

        deleteRoute(id: string): SavedRoute[] {
            db.prepare("DELETE FROM saved_routes WHERE id = ?").run(id)
            return routes()
        },

        settings,

        /** Stores the given settings; the others keep their value. */
        saveSettings(update: Partial<Settings>): Settings {
            const statement = db.prepare(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            )
            for (const [key, value] of Object.entries(update)) statement.run(key, String(value))
            return settings()
        },
    }
}

let service: UserDataService | null = null

/** The service on the user database, created (with its folder) on first use. */
export function getUserDataService(): UserDataService {
    if (!service) {
        mkdirSync(dirname(config.userDbPath), { recursive: true })
        service = createUserDataService(new DatabaseSync(config.userDbPath))
    }
    return service
}

/**
 * The walking tie for a request: the `tie` query parameter (minutes) when given, which also keeps
 * cached responses apart per setting, else the stored setting.
 */
export function walkTieSeconds(param: string | null): number {
    const minutes = parseWalkTieMinutes(param) ?? getUserDataService().settings().walkTieMinutes
    return minutes * 60
}

/** The longest walk for a request in metres: the `maxWalk` query parameter (minutes) or the stored setting. */
export function maxWalkMeters(param: string | null): number {
    const minutes = parseMaxWalkMinutes(param) ?? getUserDataService().settings().maxWalkMinutes
    return minutesToWalkMeters(minutes)
}
