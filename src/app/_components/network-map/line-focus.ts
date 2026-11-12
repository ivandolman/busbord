// Which lines are in focus: the searched line, or what the selection makes reachable

import type { Network, NetworkLine } from "@/features/network/network.service"

import type { Reachable } from "./network-map.schema"

// --- INTERFACES ---

export interface LineFocus {
    /** Route ids drawn in focus; null when every line is. */
    lineIds: Set<string> | null
    /** The same lines as indexes into network.lines. */
    indexes: Set<number>
    /** Line indexes the stop labels show; null for all lines of a stop. */
    labels: Set<number> | null
}

// --- HELPERS ---

export function lineFocus(
    network: Network,
    query: string,
    matchingLines: NetworkLine[],
    reachable: Reachable | null,
): LineFocus {
    const lineIds = query
        ? new Set(matchingLines.map((line) => line.id))
        : (reachable?.routes ?? null)
    const indexes = new Set<number>()
    network.lines.forEach((line, index) => {
        if (lineIds?.has(line.id)) indexes.add(index)
    })
    // Labels list only the lines in focus: the searched line, or the lines you can ride.
    return { lineIds, indexes, labels: query || reachable ? indexes : null }
}
