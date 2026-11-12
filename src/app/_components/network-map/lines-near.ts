// Hit-testing of the drawn lines: every line within a few pixels of a point on the screen

import L from "leaflet"

import type { NetworkLine } from "@/features/network/network.service"

import { sortLines } from "./map-lines"
import type { DrawnLine } from "./network-map.types"

// --- CONSTANTS ---

/** Click tolerance, in screen pixels, for finding every line under the pointer. */
const LINE_HIT_PIXELS = 8

// --- HELPERS ---

/** Every visible line with a path within LINE_HIT_PIXELS of a screen point, once per route. */
export function linesNear(map: L.Map, point: L.Point, drawn: DrawnLine[]): NetworkLine[] {
    const box = L.latLngBounds(
        map.containerPointToLatLng(L.point(point.x - LINE_HIT_PIXELS, point.y - LINE_HIT_PIXELS)),
        map.containerPointToLatLng(L.point(point.x + LINE_HIT_PIXELS, point.y + LINE_HIT_PIXELS)),
    )
    const limit = LINE_HIT_PIXELS * LINE_HIT_PIXELS
    const found = new Map<string, NetworkLine>()
    for (const { line, layer } of drawn) {
        if (found.has(line.id) || !map.hasLayer(layer) || !layer.getBounds().intersects(box)) {
            continue
        }
        const points = layer.getLatLngs() as L.LatLng[]
        const first = points[0]
        if (!first) continue
        let previous = map.latLngToContainerPoint(first)
        for (const next of points.slice(1)) {
            const nextPoint = map.latLngToContainerPoint(next)
            if (pixelDistanceSquared(point, previous, nextPoint) <= limit) {
                found.set(line.id, line)
                break
            }
            previous = nextPoint
        }
    }
    return [...found.values()].sort(sortLines)
}

/** Squared pixel distance from p to segment a-b. */
function pixelDistanceSquared(p: L.Point, a: L.Point, b: L.Point): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    let t = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared
    t = Math.max(0, Math.min(1, t))
    const ex = p.x - (a.x + t * dx)
    const ey = p.y - (a.y + t * dy)
    return ex * ex + ey * ey
}
