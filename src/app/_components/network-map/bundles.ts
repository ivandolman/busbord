// Draws the network's corridors: lines along a shared road side by side, each with a dark edge

import L from "leaflet"

import type { Corridor } from "@/features/network/corridors"
import type { Network, NetworkLine } from "@/features/network/network.service"

import { lineColor } from "./map-lines"
import { offsetPath, type ScreenPoint } from "./offset-path"

// --- CONSTANTS ---

/** The edge around every line ("Rand lijn" in the design). */
const CASING = "#1b2230"
/**
 * Per zoom level from 11 up: a line's width, and the widest a bundle gets (with many lines they
 * move closer together). Zoomed out, the bundles would otherwise cover the streets around them.
 */
const LINE_PIXELS = [2, 2.5, 3, 4, 5]
const MAX_BUNDLE_PIXELS = [6, 10, 18, 28, 40]

// --- INTERFACES ---

/** One line's stroke along one corridor. */
export interface Stripe {
    line: NetworkLine
    layer: L.Polyline
    casing: L.Polyline
    corridor: Corridor
    /** Position in the bundle, 0 = leftmost, of `count` lines drawn here. */
    slot: number
    count: number
}

// --- HELPERS ---

/** Stroke width and distance between neighbouring lines, in pixels. */
function layout(zoom: number, count: number, emphasized: boolean) {
    const level = Math.max(0, Math.min(LINE_PIXELS.length - 1, Math.round(zoom) - 11))
    const base = (LINE_PIXELS[level] as number) + (emphasized ? 1 : 0)
    const edge = zoom >= 13 ? 2 : 1
    const spacing = Math.min(base + edge / 2, (MAX_BUNDLE_PIXELS[level] as number) / count)
    return { width: Math.max(1, Math.min(base, spacing - edge / 4)), edge, spacing }
}

const projected = new WeakMap<Corridor, { zoom: number; points: ScreenPoint[] }>()

function stripeLatLngs(map: L.Map, stripe: Stripe, spacing: number): L.LatLng[] {
    const zoom = map.getZoom()
    let entry = projected.get(stripe.corridor)
    if (!entry || entry.zoom !== zoom) {
        entry = {
            zoom,
            points: stripe.corridor.path.map(([lat, lon]) => {
                const point = map.project([lat, lon], zoom)
                return [point.x, point.y]
            }),
        }
        projected.set(stripe.corridor, entry)
    }
    const offset = (stripe.slot - (stripe.count - 1) / 2) * spacing
    return offsetPath(entry.points, offset).map(([x, y]) => map.unproject([x, y], zoom))
}

// --- SERVICE ---

/**
 * Draws every corridor with the lines in `visible` (all lines when null) into `group`: first all
 * edges, then all colours, so each line's edge shows between it and its neighbours.
 */
export function drawStripes(
    map: L.Map,
    network: Network,
    group: L.LayerGroup,
    visible: Set<number> | null,
    emphasized: boolean,
    onClick: (line: NetworkLine, event: L.LeafletMouseEvent) => void,
): Stripe[] {
    group.clearLayers()
    const stripes: Stripe[] = []
    for (const corridor of network.corridors) {
        const shown = visible
            ? corridor.lines.filter((index) => visible.has(index))
            : corridor.lines
        shown.forEach((index, slot) => {
            const line = network.lines[index]
            if (!line) return
            const casing = L.polyline([], { color: CASING, interactive: false, lineJoin: "round" })
            const layer = L.polyline([], { color: lineColor(line), opacity: 1, lineJoin: "round" })
            layer.on("click", (event: L.LeafletMouseEvent) => onClick(line, event))
            stripes.push({ line, layer, casing, corridor, slot, count: shown.length })
        })
    }
    placeStripes(map, stripes, emphasized)
    for (const stripe of stripes) group.addLayer(stripe.casing)
    for (const stripe of stripes) group.addLayer(stripe.layer)
    return stripes
}

/** Positions and widths for the current zoom; call again after every zoom. */
export function placeStripes(map: L.Map, stripes: Stripe[], emphasized: boolean): void {
    const zoom = map.getZoom()
    for (const stripe of stripes) {
        const { width, edge, spacing } = layout(zoom, stripe.count, emphasized)
        const latlngs = stripeLatLngs(map, stripe, spacing)
        stripe.casing.setLatLngs(latlngs).setStyle({ weight: width + edge })
        stripe.layer.setLatLngs(latlngs).setStyle({ weight: width })
    }
}
