// Draws the network's corridors: one calm stroke per mode, or each line in its colour when in focus

import L from "leaflet"

import type { Corridor } from "@/features/network/corridors"
import type { Network, NetworkLine } from "@/features/network/network.service"

import { lineColor } from "./map-lines"
import { offsetPath, type ScreenPoint } from "./offset-path"

// --- CONSTANTS ---

/** Per zoom level from 11 up. Busier roads get wider strokes, between these widths. */
const MIN_PIXELS = [1.5, 2, 2.5, 3, 3.5]
const MAX_PIXELS = [3.5, 4.5, 6, 7.5, 9]
/** A line in focus, in its own colour. */
const FOCUS_PIXELS = [3, 3.5, 4, 5, 6]
/** A bundle of lines in focus never gets wider than this; they move closer together instead. */
const MAX_BUNDLE_PIXELS = [8, 12, 20, 30, 42]

/** Roads busier than this share of all roads get the widest stroke. */
const BUSY_PERCENTILE = 0.9

/** Stroke groups outside a search or selection, in the order they lie side by side. */
const KINDS = ["rail", "bus", "night", "ferry"] as const

// --- INTERFACES ---

type Kind = (typeof KINDS)[number]

/** One stroke along one corridor: a mode's lines together, or one line in focus. */
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
function themeColors(): Record<Kind | "edge", string> {
    const style = getComputedStyle(document.documentElement)
    const read = (name: string, fallback: string) =>
        style.getPropertyValue(`--color-map-${name}`).trim() || fallback
    return {
        rail: read("rail", "#d6453d"),
        bus: read("bus", "#7c8594"),
        night: read("night", "#a9b0bb"),
        ferry: read("ferry", "#2f86c8"),
        edge: read("edge", "#ffffff"),
    }
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

/** What is drawn along one corridor: each line in focus, or else each mode once. */
function strokeGroups(
    lines: NetworkLine[],
    focus: boolean,
    colors: Record<Kind | "edge", string>,
): StrokeGroup[] {
    if (focus) {
        return lines.map((line) => ({
            lines: [line],
            color: lineColor(line),
            trips: 0,
            night: false,
        }))
    }
    return KINDS.map((kind) => ({ kind, ofKind: lines.filter((line) => kindOf(line) === kind) }))
        .filter(({ ofKind }) => ofKind.length > 0)
        .map(({ kind, ofKind }) => ({
            lines: ofKind,
            color: colors[kind],
            trips: ofKind.reduce((sum, line) => sum + line.trips, 0),
            night: kind === "night",
        }))
}

// --- SERVICE ---

/**
 * Draws every corridor into `group`. Without a focus (`visible` null) each mode is one neutral
 * stroke, as wide as the road is busy; the stops show which lines run there. With a focus, only
 * those lines, each in its own colour, side by side where they share a road. Edges go in first,
 * so each stroke's edge shows between it and its neighbour.
 */
export function drawStripes(
    map: L.Map,
    network: Network,
    group: L.LayerGroup,
    visible: Set<number> | null,
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
        return lines.length > 0 ? [{ corridor, groups: strokeGroups(lines, focus, colors) }] : []
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
            // Night buses dashed: they share the bus colour's calm, but not its timetable.
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
        let widths = siblings.map((sibling) => strokeWidth(sibling, zoom))
        // Neighbours overlap by half an edge, leaving a thin edge line between their colours.
        let total = widths.reduce((sum, width) => sum + width + edge / 2, 0)
        const limit = MAX_BUNDLE_PIXELS[level(zoom)] as number
        if (stripe.focus && total > limit) {
            widths = widths.map((width) => Math.max(1, (width * limit) / total))
            total = limit
        }
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
