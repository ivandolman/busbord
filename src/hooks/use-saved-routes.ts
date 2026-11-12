// Saved routes from the server (/api/routes), one shared copy for every component

import { useCallback, useEffect, useSyncExternalStore } from "react"

import { z } from "zod"

import {
    parseRouteList,
    parseSavedRoutes,
    STORAGE_KEY,
    withRoute,
    type SavedRoute,
} from "@/features/saved-routes/saved-routes"

// --- CONSTANTS ---

/** The list itself is checked route by route in parseRouteList. */
const RoutesResponseSchema = z.object({ routes: z.unknown() })

// --- INTERFACES ---

type State = { routes: SavedRoute[]; loaded: boolean }

// --- HELPERS ---

const SERVER_SNAPSHOT: State = { routes: [], loaded: false }
let state: State = SERVER_SNAPSHOT
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function set(next: State) {
    state = next
    for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

async function request(input: string, init?: RequestInit): Promise<SavedRoute[]> {
    const response = await fetch(input, init)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = RoutesResponseSchema.parse(await response.json())
    return parseRouteList(body.routes)
}

const post = (route: SavedRoute) =>
    request("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(route),
    })

/** Routes an earlier version kept in this browser go to the server once, then leave the browser. */
async function moveBrowserRoutes(routes: SavedRoute[]): Promise<SavedRoute[]> {
    let raw: string | null = null
    try {
        raw = window.localStorage.getItem(STORAGE_KEY)
    } catch {
        return routes
    }
    const local = parseSavedRoutes(raw)
    // Oldest first, so the newest ends up on top as before.
    for (const route of [...local].reverse()) {
        if (!routes.some((known) => known.from.id === route.from.id && known.to.id === route.to.id))
            routes = await post(route)
    }
    if (raw !== null) window.localStorage.removeItem(STORAGE_KEY)
    return routes
}

function load(): Promise<void> {
    loading ??= request("/api/routes")
        .then(moveBrowserRoutes)
        .then((routes) => set({ routes, loaded: true }))
        .catch(() => {
            // Server unreachable: show nothing saved rather than an error; try again next visit.
            set({ routes: [], loaded: true })
        })
    return loading
}

/** Resolves with the routes once the first load has finished (also when it failed: then empty). */
export function whenSavedRoutesLoaded(): Promise<SavedRoute[]> {
    return load().then(() => state.routes)
}

export function useSavedRoutes() {
    const current = useSyncExternalStore(
        subscribe,
        () => state,
        () => SERVER_SNAPSHOT,
    )
    useEffect(() => void load(), [])

    /** Shown at once; undone when the server refuses. Resolves to whether it was stored. */
    const save = useCallback(async (route: SavedRoute) => {
        const before = state.routes
        set({ ...state, routes: withRoute(before, route) })
        try {
            set({ ...state, routes: await post(route) })
            return true
        } catch {
            set({ ...state, routes: before })
            return false
        }
    }, [])

    const remove = useCallback(async (id: string) => {
        const before = state.routes
        set({ ...state, routes: before.filter((route) => route.id !== id) })
        try {
            set({
                ...state,
                routes: await request(`/api/routes?id=${encodeURIComponent(id)}`, {
                    method: "DELETE",
                }),
            })
        } catch {
            set({ ...state, routes: before })
        }
    }, [])

    return { routes: current.routes, loaded: current.loaded, save, remove }
}
