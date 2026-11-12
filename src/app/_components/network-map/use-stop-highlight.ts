// A ring around the open stop on the map: it pulses when the stop opens and stays while open

"use client"

import { useEffect } from "react"

import L from "leaflet"

import type { OpenStop } from "./network-map.types"

// --- CONSTANTS ---

const HIGHLIGHT_ICON = L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: '<span class="stop-highlight"></span>',
})

// --- HOOK ---

export function useStopHighlight(map: L.Map | null, stop: OpenStop | null) {
    useEffect(() => {
        if (!map || !stop) return
        const marker = L.marker([stop.stop.lat, stop.stop.lon], {
            icon: HIGHLIGHT_ICON,
            interactive: false,
            keyboard: false,
            zIndexOffset: -1000,
        }).addTo(map)
        return () => {
            marker.remove()
        }
    }, [map, stop])
}
