// The height the visible bottom sheet covers, for what floats over the map to keep clear of it

import { useSyncExternalStore } from "react"

// --- INTERFACES ---

export interface SheetMetrics {
    /** How much of the screen the sheet covers at its snap, in px; 0 on a wide screen. */
    covered: number
    /** Height of the screen the sheet is laid out in; 0 until measured or on a wide screen. */
    screen: number
}

// --- CONSTANTS ---

const NONE: SheetMetrics = { covered: 0, screen: 0 }

// --- HELPERS ---

let current = NONE
const listeners = new Set<() => void>()

export function publishSheetMetrics(next: SheetMetrics) {
    if (next.covered === current.covered && next.screen === current.screen) return
    current = next
    for (const listener of listeners) listener()
}

export function resetSheetMetrics() {
    publishSheetMetrics(NONE)
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function useSheetMetrics(): SheetMetrics {
    return useSyncExternalStore(
        subscribe,
        () => current,
        () => NONE,
    )
}
