// Draws the network's corridors: one stroke per mode, or each line on its own when in focus

import L from "leaflet"

import type { Corridor } from "@/features/network/corridors"
import type { Network, NetworkLine } from "@/features/network/network.service"

import { lineColor } from "./map-lines"
import type { AdvisedLine } from "./network-map.types"
import { offsetPath, type ScreenPoint } from "./offset-path"

// --- CONSTANTS ---

/** Per zoom level from 11 up. Busier roads get wider strokes, between these widths. */
const MIN_PIXELS = [1.5, 2, 2.5, 3, 3.5]
const MAX_PIXELS = [3.5, 4.5, 6, 7.5, 9]
/** Lines in focus: searched, or ridden. */
const FOCUS_PIXELS = [3, 3.5, 4, 5, 6]

/** Roads busier than this share of all roads get the widest stroke. */
const BUSY_PERCENTILE = 0.9

/** Stroke groups outside a search or selection, in the order they lie side by side. */
const KINDS = ["rail", "bus", "night", "ferry"] as const

// --- INTERFACES ---

type Kind = (typeof KINDS)[number]

/** One stroke along one corridor: a mode's lines together, or every line in focus. */
export interface Stripe {
    lines: NetworkLine[]
    layer: L.Polyline
    casing: L.Polyline
    corridor: Corridor
    /** Every stripe along the same corridor, left to right, this one included. */
    siblings: Stripe[]
    /** How busy the stroke is, 0 to 1 (focus strokes ignore it). */
    weight: number
    focus: boolean
}

interface StrokeGroup {
    lines: NetworkLine[]
    color: string
    trips: number
    night: boolean
}

// --- HELPERS ---

function kindOf(line: NetworkLine): Kind {
    if (line.mode === "tram" || line.mode === "metro" || line.mode === "train") return "rail"
    if (line.mode === "ferry") return "ferry"
    return /^N\d/i.test(line.line) ? "night" : "bus"
}

/** The map colours from the theme (see colors.css); the canvas cannot read CSS variables. */
function themeColors(): { night: string; edge: string } {
    const style = getComputedStyle(document.documentElement)
    const read = (name: string, fallback: string) =>
        style.getPropertyValue(`--color-map-${name}`).trim() || fallback
    return { night: read("night", "#a9b0bb"), edge: read("edge", "#ffffff") }
}

function level(zoom: number): number {
    return Math.max(0, Math.min(MIN_PIXELS.length - 1, Math.round(zoom) - 11))
}

function strokeWidth(stripe: Stripe, zoom: number): number {
    const at = level(zoom)
    if (stripe.focus) return FOCUS_PIXELS[at] as number
    const min = MIN_PIXELS[at] as number
    return min + ((MAX_PIXELS[at] as number) - min) * stripe.weight
}

const projected = new WeakMap<Corridor, { zoom: number; points: ScreenPoint[] }>()

function project(map: L.Map, corridor: Corridor, zoom: number): ScreenPoint[] {
    let entry = projected.get(corridor)
    if (!entry || entry.zoom !== zoom) {
        entry = {
            zoom,
            points: corridor.path.map(([lat, lon]) => {
                const point = map.project([lat, lon], zoom)
                return [point.x, point.y]
            }),
        }
        projected.set(corridor, entry)
    }
    return entry.points
}

/** What is drawn along one corridor: one stroke for the lines in focus, or else one per mode. */
function strokeGroups(
    lines: NetworkLine[],
    focus: boolean,
    colors: { night: string; edge: string },
    advised: AdvisedLine | null,
): StrokeGroup[] {
    if (focus) {
        // In the colour of the advised line where it runs, else the busiest (a day line if any).
        const day = lines.filter((line) => kindOf(line) !== "night")
        const shown =
            lines.find((line) => line.line === advised?.line && line.mode === advised.mode) ??
            (day.length > 0 ? day : lines).reduce((a, b) => (b.trips > a.trips ? b : a))
        return [{ lines, color: lineColor(shown), trips: 0, night: false }]
    }
    return KINDS.map((kind) => ({ kind, ofKind: lines.filter((line) => kindOf(line) === kind) }))
        .filter(({ ofKind }) => ofKind.length > 0)
        .map(({ kind, ofKind }) => ({
            lines: ofKind,
            // The busiest line's own colour; night lines are black in the feed, lost on a dark map.
            color:
                kind === "night"
                    ? colors.night
                    : lineColor(ofKind.reduce((a, b) => (b.trips > a.trips ? b : a))),
            trips: ofKind.reduce((sum, line) => sum + line.trips, 0),
            night: kind === "night",
        }))
}

// --- SERVICE ---

/**
 * Draws every corridor into `group`, one stroke per road however many lines share it: the stops
 * and a tap on the stroke say which lines run there. Without a focus (`visible` null) each mode
 * gets a stroke in the colour of its busiest line, as wide as the road is busy. With a focus,
 * only the lines in focus, as one stroke in the colour of the busiest of them. Edges go in first,
 * so where modes lie side by side each stroke's edge shows between it and its neighbour.
 */
export function drawStripes(
    map: L.Map,
    network: Network,
    group: L.LayerGroup,
    visible: Set<number> | null,
    advised: AdvisedLine | null,
    onClick: (lines: NetworkLine[], event: L.LeafletMouseEvent) => void,
): Stripe[] {
    group.clearLayers()
    const colors = themeColors()
    const focus = visible !== null
    const perCorridor = network.corridors.flatMap((corridor) => {
        const lines = corridor.lines
            .filter((index) => !visible || visible.has(index))
            .map((index) => network.lines[index])
            .filter((line): line is NetworkLine => line !== undefined)
        return lines.length > 0
            ? [{ corridor, groups: strokeGroups(lines, focus, colors, advised) }]
            : []
    })

    // Widths follow the square root of the trips. Relative to a busy road rather than the
    // busiest: the few roads into the central station would otherwise make all others thin.
    const trips = perCorridor
        .flatMap(({ groups }) => groups.map((entry) => entry.trips))
        .sort((x, y) => x - y)
    const busiest = Math.max(1, trips[Math.floor(trips.length * BUSY_PERCENTILE)] ?? 0)
    const stripes: Stripe[] = []
    for (const { corridor, groups } of perCorridor) {
        const siblings: Stripe[] = []
        for (const { lines, color, trips: count, night } of groups) {
            const casing = L.polyline([], {
                color: colors.edge,
                interactive: false,
                lineJoin: "round",
            })
            // Night buses dashed: they run along the same roads, but not at the same hours.
            const layer = L.polyline([], {
                color,
                opacity: 1,
                lineJoin: "round",
                ...(night ? { dashArray: "6 5", lineCap: "butt" as const } : {}),
            })
            layer.on("click", (event: L.LeafletMouseEvent) => onClick(lines, event))
            siblings.push({
                lines,
                layer,
                casing,
                corridor,
                siblings,
                weight: Math.min(1, Math.sqrt(count / busiest)),
                focus,
            })
        }
        stripes.push(...siblings)
    }
    placeStripes(map, stripes)
    for (const stripe of stripes) group.addLayer(stripe.casing)
    for (const stripe of stripes) group.addLayer(stripe.layer)
    return stripes
}

/** Positions and widths for the current zoom; call again after every zoom. */
export function placeStripes(map: L.Map, stripes: Stripe[]): void {
    const zoom = map.getZoom()
    const edge = zoom >= 13 ? 2 : 1
    const done = new Set<Stripe[]>()
    for (const stripe of stripes) {
        const { siblings } = stripe
        if (done.has(siblings)) continue
        done.add(siblings)
        const widths = siblings.map((sibling) => strokeWidth(sibling, zoom))
        // Neighbours overlap by half an edge, leaving a thin edge line between their colours.
        const total = widths.reduce((sum, width) => sum + width + edge / 2, 0)
        const points = project(map, stripe.corridor, zoom)
        let left = -total / 2
        siblings.forEach((sibling, i) => {
            const width = widths[i] as number
            const offset = left + (width + edge / 2) / 2
            left += width + edge / 2
            const latlngs = offsetPath(points, offset).map(([x, y]) => map.unproject([x, y], zoom))
            sibling.casing.setLatLngs(latlngs).setStyle({ weight: width + edge })
            sibling.layer.setLatLngs(latlngs).setStyle({ weight: width })
        })
    }
}
