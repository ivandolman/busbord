// Saved routes: parsing, schedules and list operations, shared by the server store and the browser

import {
    MAX_ROUTE_NAME_LENGTH,
    SavedRouteSchema,
    type RouteSchedule,
    type SavedPlace,
    type SavedRoute,
} from "./saved-routes.schema"

// --- CONSTANTS ---

/** Where earlier versions kept routes in the browser; read once to move them to the server. */
export const STORAGE_KEY = "bestemmingsbord:routes:v1"
export const MAX_ROUTES = 50

export const DAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"]
/** Monday first, the way a Dutch week reads. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0]

// --- INTERFACES ---

// Re-exported so client code keeps one import path for the types it uses with these helpers.
export type { RouteSchedule, SavedPlace, SavedRoute }

// --- HELPERS ---

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

// --- SERVICE ---

/** Whether a moment falls inside the schedule. Past midnight, the day is the one the window started on. */
export function isScheduledAt(schedule: RouteSchedule, date: Date): boolean {
    const minute = date.getHours() * 60 + date.getMinutes()
    const start = toMinutes(schedule.start)
    const end = toMinutes(schedule.end)
    const day = date.getDay()
    if (start < end) return schedule.days.includes(day) && minute >= start && minute <= end
    if (minute >= start) return schedule.days.includes(day)
    return minute <= end && schedule.days.includes((day + 6) % 7)
}

/** The first saved route whose schedule covers this moment. */
export function scheduledRoute(routes: SavedRoute[], date: Date): SavedRoute | null {
    return routes.find((route) => route.schedule && isScheduledAt(route.schedule, date)) ?? null
}

/** "ma–vr 07:30–09:00", "ma, wo, vr 16:30–18:00", "elke dag 08:00–09:00". */
export function scheduleLabel(schedule: RouteSchedule): string {
    const ordered = WEEK.filter((day) => schedule.days.includes(day))
    let days: string
    if (ordered.length === 7) days = "elke dag"
    else {
        const positions = ordered.map((day) => WEEK.indexOf(day))
        const consecutive = positions.every(
            (position, i) => i === 0 || position === (positions[i - 1] ?? -2) + 1,
        )
        days =
            consecutive && ordered.length >= 3
                ? `${DAY_SHORT[ordered[0] ?? 0]}–${DAY_SHORT[ordered[ordered.length - 1] ?? 0]}`
                : ordered.map((day) => DAY_SHORT[day]).join(", ")
    }
    return `${days} ${schedule.start}–${schedule.end}`
}

/**
 * Reads whatever is in storage defensively: it may be from an older version, edited by hand or
 * written by another tab mid-way. Anything that does not look like a route is dropped.
 */
export function parseSavedRoutes(raw: string | null): SavedRoute[] {
    if (!raw) return []
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        return []
    }
    return parseRouteList(data)
}

/** Same as parseSavedRoutes, for data that is already parsed (a request body). */
export function parseRouteList(data: unknown): SavedRoute[] {
    if (!Array.isArray(data)) return []
    return data.slice(0, MAX_ROUTES).flatMap((entry: unknown) => {
        const parsed = SavedRouteSchema.safeParse(entry)
        return parsed.success ? [parsed.data] : []
    })
}

export function routeName(name: string, from: SavedPlace, to: SavedPlace): string {
    const trimmed = name.trim().slice(0, MAX_ROUTE_NAME_LENGTH)
    return (
        trimmed ||
        `${from.name || "Vertrek"} → ${to.name || "Bestemming"}`.slice(0, MAX_ROUTE_NAME_LENGTH)
    )
}

export function sameRoute(route: SavedRoute, fromId: string | null, toId: string | null): boolean {
    return route.from.id === fromId && route.to.id === toId
}

export function withRoute(routes: SavedRoute[], route: SavedRoute): SavedRoute[] {
    // Saving the same trip again replaces it (with its new name) instead of adding a duplicate.
    const others = routes.filter(
        (existing) => existing.id !== route.id && !sameRoute(existing, route.from.id, route.to.id),
    )
    return [route, ...others].slice(0, MAX_ROUTES)
}
