// Line-number labels next to the stops in view, with the next ride's wait when it is known

import L from "leaflet"

import type { NextDepartures } from "@/features/board/board.types"
import { formatWait } from "@/features/board/format"
import type { Network, NetworkLine, NetworkStop } from "@/features/network/network.service"
import { textOn } from "@/hooks/use-network"

import { lineColor, sortLines } from "./map-lines"
import type { Reachable } from "./network-map.schema"
import type { DrawnStop } from "./network-map.types"

// --- CONSTANTS ---

/** From this zoom on, stops get a label with their lines where there is room for it. */
const LABEL_MIN_ZOOM = 15
const LABEL_MAX_LINES = 5
const LABEL_CHAR_PX = 8
const LABEL_HEIGHT_PX = 26

// --- INTERFACES ---

export type AreaTimes = Map<string, NextDepartures["areas"][string]>

export interface LabelledStop extends DrawnStop {
    lines: NetworkLine[]
}

interface DrawStopLabelsOptions {
    map: L.Map
    group: L.LayerGroup
    candidates: LabelledStop[]
    /** Next rides towards the destination per stop area; null without a destination. */
    times: AreaTimes | null
    reachable: Reachable | null
    now: number
}

// --- HELPERS ---

/**
 * The stops in view that get a label, with the lines to show: stops with the most lines go
 * first; faded stops get none.
 */
export function labelledStops(
    map: L.Map,
    stops: DrawnStop[],
    network: Network,
    focus: Set<number> | null,
): LabelledStop[] {
    if (map.getZoom() < LABEL_MIN_ZOOM) return []
    const bounds = map.getBounds().pad(0.1)
    return stops
        .filter(({ layer, look }) => look !== "faded" && bounds.contains(layer.getLatLng()))
        .map((circle) => {
            const lines = circle.stop.lines
                .filter((index) => !focus || focus.has(index))
                .map((index) => network.lines[index])
                .filter((line): line is NetworkLine => line !== undefined && line.line !== "")
                .sort(sortLines)
                .filter((line, i, all) => all.findIndex((other) => other.line === line.line) === i)
            return { ...circle, lines }
        })
        .filter((candidate) => candidate.lines.length > 0)
        .sort((a, b) => b.lines.length - a.lines.length)
}

/** Where you can get on: times belong there, not at stops further along the ride. */
export function isBoarding(stop: NetworkStop, reachable: Reachable | null): boolean {
    const board = reachable?.boardAreas
    return !board || stop.areaIds.some((id) => board.has(id))
}

/** Redraws the labels, top right of each dot, wherever they do not overlap one already placed. */
export function drawStopLabels({
    map,
    group,
    candidates,
    times,
    reachable,
    now,
}: DrawStopLabelsOptions): void {
    group.clearLayers()
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (const { layer, stop, lines: allLines } of candidates) {
        // With a destination and times loaded: only lines that go there from here, soonest first.
        let lines = allLines.map((line) => ({ line, wait: "" }))
        if (times && isBoarding(stop, reachable) && stop.areaIds.some((id) => times.has(id))) {
            const soonest = new Map<string, number>()
            for (const id of stop.areaIds) {
                for (const next of times.get(id) ?? []) {
                    const key = `${next.mode}|${next.line}`
                    soonest.set(key, Math.min(soonest.get(key) ?? Infinity, next.expectedDeparture))
                }
            }
            lines = allLines
                .map((line) => ({ line, at: soonest.get(`${line.mode}|${line.line}`) }))
                .filter(
                    (entry): entry is { line: NetworkLine; at: number } => entry.at !== undefined,
                )
                .sort((a, b) => a.at - b.at)
                .map(({ line, at }) => ({ line, wait: formatWait(at, now) }))
            if (lines.length === 0) continue
        }
        const shown = lines.slice(0, LABEL_MAX_LINES)
        const more = lines.length - shown.length
        const width =
            shown.reduce(
                (sum, { line, wait }) =>
                    sum +
                    Math.max(24, line.line.length * LABEL_CHAR_PX + 10) +
                    4 +
                    (wait ? wait.length * LABEL_CHAR_PX + 5 : 0),
                0,
            ) +
            (more > 0 ? String(more).length * LABEL_CHAR_PX + 14 : 0) +
            10
        const point = map.latLngToContainerPoint(layer.getLatLng())
        const radius = layer.getRadius()
        const box = {
            x1: point.x + radius + 1,
            y1: point.y - radius - LABEL_HEIGHT_PX,
            x2: point.x + radius + 1 + width,
            y2: point.y - radius,
        }
        if (
            placed.some(
                (other) =>
                    box.x1 < other.x2 &&
                    box.x2 > other.x1 &&
                    box.y1 < other.y2 &&
                    box.y2 > other.y1,
            )
        ) {
            continue
        }
        placed.push(box)
        const marker = L.marker(layer.getLatLng(), {
            icon: L.divIcon({
                className: "",
                html: labelHtml(shown, more),
                iconSize: [0, 0],
                iconAnchor: [-(radius + 1), radius + LABEL_HEIGHT_PX],
            }),
            keyboard: false,
            title: lines
                .map(({ line, wait }) => (wait ? `Lijn ${line.line}: ${wait}` : line.line))
                .join(", "),
        })
        // The label opens the stop, like the dot.
        marker.on("click", (event: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(event)
            layer.fire("click", { latlng: layer.getLatLng() })
        })
        group.addLayer(marker)
    }
}

function labelHtml(shown: { line: NetworkLine; wait: string }[], more: number): string {
    const chips = shown
        .map(
            ({ line, wait }) =>
                // The time next to the badge, in plain text: a number inside it would read as a line.
                `<span style="background:${lineColor(line)};color:${textOn(lineColor(line))};border-radius:5px;padding:1px 5px;min-width:24px;text-align:center;font:700 13px/17px var(--font-sans)">${escapeHtml(line.line)}</span>${
                    wait
                        ? `<span style="color:var(--color-foreground);font:600 13px/17px var(--font-sans);padding:0 4px 0 1px">${escapeHtml(wait)}</span>`
                        : ""
                }`,
        )
        .join("")
    return `<div style="display:flex;align-items:center;gap:4px;width:max-content;padding:3px 5px;border-radius:9px;background:var(--color-background);box-shadow:0 4px 16px rgba(0,0,0,.2)">${chips}${
        more > 0
            ? `<span style="color:var(--color-muted);font:600 13px/17px var(--font-sans);padding:0 2px">+${more}</span>`
            : ""
    }</div>`
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}
