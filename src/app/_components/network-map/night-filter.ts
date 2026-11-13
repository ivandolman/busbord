// Leaves night lines out of the map while they do not run, unless you search for one

import type { Network } from "@/features/network/network.service"
import { isNightLine } from "@/features/network/night-lines"

import type { Reachable } from "./network-map.schema"

// --- HELPERS ---

/**
 * Route ids of night lines to hide: every night line not in `running` and not in `kept`.
 * Until `running` is known, every night line counts as not running.
 */
export function idleNightLines(
    network: Network,
    running: Set<string> | null,
    kept: Set<string>,
): Set<string> {
    return new Set(
        network.lines
            .filter(
                (line) => isNightLine(line.line) && !running?.has(line.id) && !kept.has(line.id),
            )
            .map((line) => line.id),
    )
}

/**
 * The network without the given lines on its roads and stops. Lines stay in `lines` (stops and
 * corridors refer to them by index); roads and stops left without lines go.
 */
export function withoutLines(network: Network, hidden: Set<string>): Network {
    if (hidden.size === 0) return network
    const shown = (index: number) => {
        const line = network.lines[index]
        return line !== undefined && !hidden.has(line.id)
    }
    return {
        ...network,
        corridors: network.corridors.flatMap((corridor) => {
            const lines = corridor.lines.filter(shown)
            return lines.length > 0 ? [{ ...corridor, lines }] : []
        }),
        stops: network.stops.flatMap((stop) => {
            const lines = stop.lines.filter(shown)
            return lines.length > 0 ? [{ ...stop, lines }] : []
        }),
    }
}

/** What the selection reaches, without the given lines. */
export function reachableWithout(reachable: Reachable, hidden: Set<string>): Reachable {
    if (hidden.size === 0 || ![...reachable.routes].some((id) => hidden.has(id))) return reachable
    return {
        ...reachable,
        routes: new Set([...reachable.routes].filter((id) => !hidden.has(id))),
        segments: reachable.segments?.filter((segment) => !hidden.has(segment.routeId)) ?? null,
    }
}
