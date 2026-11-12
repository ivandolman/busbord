// Dutch phrasing of walks, stops and waits shared by the board and the trip view

import type { Departure } from "./board.types"
import { shortHeadsign } from "./group"

// --- HELPERS ---

/** Whole minutes, at least 1. */
export const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60))

/** "Utrecht, Padualaan" reads as "Padualaan" next to a stop in the same place. */
export function shortStop(name: string, originName: string): string {
    return shortHeadsign(name.replace(/ \([^)]*\)$/, ""), originName.replace(/^Bij /, ""))
}

/** A formatWait result in a sentence: "nu", "om 13:05" or "over 4 min". */
export function whenPhrase(wait: string): string {
    if (wait === "nu") return "nu"
    return wait.includes(":") ? `om ${wait}` : `over ${wait}`
}

/** "Lopen: 6 min naar Padualaan, 4 min vanaf Kleinesingel", or null when you board and get off where you asked. */
export function walkLine(
    departure: Departure,
    originName: string,
    destinationName: string,
): string | null {
    const parts = [
        departure.walkToSeconds > 0
            ? `${minutes(departure.walkToSeconds)} min naar ${shortStop(departure.from.name, originName)}`
            : null,
        departure.walkFromSeconds > 0
            ? `${minutes(departure.walkFromSeconds)} min vanaf ${shortStop(departure.to.name, destinationName)}`
            : null,
    ].filter(Boolean)
    if (parts.length === 0) return null
    const total = departure.walkToSeconds + departure.walkFromSeconds
    return `Lopen: ${parts.join(", ")}${parts.length > 1 ? ` (~${minutes(total)} min)` : ""}`
}
