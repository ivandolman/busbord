// Look and hit area of the stop dots on the map

import type L from "leaflet"

import type { StopLook } from "./network-map.types"

// --- CONSTANTS ---

const FADED = "#a8a29e"

/**
 * On touch screens a stop reacts to a tap within this many pixels of its centre, whatever its
 * drawn size: a fingertip is far less precise than a mouse.
 */
const TOUCH_HIT_RADIUS = 20

export const STOP_STYLE: Record<StopLook, L.CircleMarkerOptions> = {
    normal: { weight: 2, color: "#111418", fillColor: "#ffffff", opacity: 1, fillOpacity: 1 },
    focus: { weight: 2.5, color: "#111418", fillColor: "#ffffff", opacity: 1, fillOpacity: 1 },
    faded: { weight: 1, color: FADED, fillColor: "#ffffff", opacity: 0.4, fillOpacity: 0.4 },
}

// --- HELPERS ---

/** Dots grow when zoomed in, so they stay easy to hit with a finger. */
export function stopRadius(look: StopLook, zoom: number): number {
    const step = zoom >= 16 ? 2 : zoom >= 14 ? 1 : 0
    if (look === "focus") return [6, 7, 9][step] as number
    if (look === "faded") return [2, 3, 4][step] as number
    return [4, 5, 7][step] as number
}

/**
 * Widens the area that counts as a tap on the dot without drawing it bigger. Leaflet 1.9
 * hit-tests canvas circles with radius + _clickTolerance(); there is no public option per layer.
 */
export function widenTouchTarget(layer: L.CircleMarker): void {
    if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return
    const target = layer as unknown as { _clickTolerance: () => number; _map?: L.Map }
    const original = target._clickTolerance.bind(layer)
    // Zoomed out the stops lie too close together for this; there you zoom in first anyway.
    target._clickTolerance = () =>
        target._map && target._map.getZoom() >= 14
            ? Math.max(original(), TOUCH_HIT_RADIUS - layer.getRadius())
            : original()
}
