// Directions at a stop (poles grouped by where their buses go next) and the one to open on

import type { StopBoard } from "@/features/board/board.types"

// --- INTERFACES ---

/** A direction at a stop: the poles whose buses go the same way next. */
export interface StopDirection {
    key: string
    towards: string | null
    poleIds: Set<string>
}

// --- HELPERS ---

export function directionsOf(board: StopBoard): StopDirection[] {
    const byKey = new Map<string, StopDirection>()
    for (const pole of board.poles) {
        const key = pole.towards ?? ""
        const direction = byKey.get(key) ?? {
            key,
            towards: pole.towards,
            poleIds: new Set<string>(),
        }
        direction.poleIds.add(pole.id)
        byKey.set(key, direction)
    }
    return [...byKey.values()]
}

/**
 * The direction to open on: with a destination, the one most rides there leave from (your side
 * of the street); otherwise every direction.
 */
export function defaultDirection(board: StopBoard): string | null {
    const directions = directionsOf(board)
    if (!board.destination || directions.length < 2) return null
    let best: { key: string; count: number } | null = null
    for (const direction of directions) {
        const count = board.departures.filter(
            (departure) =>
                departure.toDestination &&
                !departure.cancelled &&
                direction.poleIds.has(departure.poleId),
        ).length
        if (count > 0 && (!best || count > best.count)) best = { key: direction.key, count }
    }
    return best?.key ?? null
}
