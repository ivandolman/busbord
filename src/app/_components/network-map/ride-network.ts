// The stretches of a planned ride as a small network, merged like the full one so they lie side by side

import { buildCorridors, compareDrawingOrder } from "@/features/network/corridors"
import type { LatLon, Network, NetworkLine } from "@/features/network/network.service"

// --- INTERFACES ---

export interface RideNetwork {
    /** The network with only the ridden stretches as corridors. */
    network: Network
    /** Indexes of the lines ridden. */
    visible: Set<number>
    /** Changes with every new set of stretches, so the map knows to draw again. */
    key: string
}

// --- HELPERS ---

const built = new WeakMap<object, RideNetwork>()
let drawn = 0

// --- SERVICE ---

/**
 * The ridden stretches as corridors of their own. Built from the raw paths of each line and
 * direction, they would lie next to and across each other; merged, lines that ride the same
 * street share one centre line.
 */
export function rideNetwork(
    network: Network,
    segments: { routeId: string; path: LatLon[] }[],
): RideNetwork {
    const cached = built.get(segments)
    if (cached && cached.network.lines === network.lines) return cached
    const indexOf = new Map(network.lines.map((line, index) => [line.id, index]))
    const paths = new Map<number, LatLon[][]>()
    for (const { routeId, path } of segments) {
        const index = indexOf.get(routeId)
        if (index === undefined || path.length < 2) continue
        paths.set(index, [...(paths.get(index) ?? []), path])
    }
    const order = [...paths.keys()].sort((a, b) =>
        compareDrawingOrder(network.lines[a] as NetworkLine, network.lines[b] as NetworkLine),
    )
    const corridors = buildCorridors(
        order.map((index) => ({ index, paths: paths.get(index) ?? [] })),
    )
    const result = {
        network: { ...network, corridors },
        visible: new Set(paths.keys()),
        key: `ride:${++drawn}`,
    }
    built.set(segments, result)
    return result
}
