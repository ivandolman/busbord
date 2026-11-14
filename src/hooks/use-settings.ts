// Settings stored on the server (/api/settings), shared by every component on the page

import { useCallback, useEffect, useSyncExternalStore } from "react"

import { z } from "zod"

// --- CONSTANTS ---

const DEFAULTS = { walkTieMinutes: 2, mapStyle: "calm", maxWalkMinutes: 12, walkKmh: 5 } as const

/** Mirrors Settings in features/user-data (server-only module); anything unexpected falls back to the default. */
const SettingsSchema = z
    .object({
        walkTieMinutes: z.number().catch(DEFAULTS.walkTieMinutes),
        mapStyle: z.enum(["calm", "detailed"]).catch(DEFAULTS.mapStyle),
        maxWalkMinutes: z.number().catch(DEFAULTS.maxWalkMinutes),
        walkKmh: z.number().catch(DEFAULTS.walkKmh),
    })
    .catch({ ...DEFAULTS })

// --- INTERFACES ---

export type Settings = z.infer<typeof SettingsSchema>

type State = { settings: Settings; loaded: boolean }

// --- HELPERS ---

const SERVER_SNAPSHOT: State = { settings: { ...DEFAULTS }, loaded: false }
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

const parse = (body: unknown): Settings => SettingsSchema.parse(body)

function load(): Promise<void> {
    loading ??= fetch("/api/settings")
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
        .then((body: unknown) => set({ settings: parse(body), loaded: true }))
        .catch(() => set({ settings: { ...DEFAULTS }, loaded: true }))
    return loading
}

/** Query parameters that pass the walking settings to the API (and keep cached answers apart). */
export function walkParams(settings: Settings): Record<string, string> {
    return {
        tie: String(settings.walkTieMinutes),
        maxWalk: String(settings.maxWalkMinutes),
        speed: String(settings.walkKmh),
    }
}

export function useSettings() {
    const current = useSyncExternalStore(
        subscribe,
        () => state,
        () => SERVER_SNAPSHOT,
    )
    useEffect(() => void load(), [])

    const update = useCallback(async (settings: Settings) => {
        const before = state.settings
        set({ ...state, settings })
        try {
            const response = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            })
            if (!response.ok) throw new Error()
            set({ ...state, settings: parse(await response.json()) })
        } catch {
            set({ ...state, settings: before })
        }
    }, [])

    return { settings: current.settings, loaded: current.loaded, update }
}
