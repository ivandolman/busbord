// Phone: the map flies to a stop when its sheet opens, and back to where it was when it closes

"use client"

import { useEffect, useRef } from "react"

import L from "leaflet"

import { VISIBLE } from "@/components/ui/sheet"

import type { OpenStop } from "./network-map.types"

// --- CONSTANTS ---

/** Close enough to see the stop's street and its poles. */
const STOP_ZOOM = 16
const FLIGHT_SECONDS = 0.8

// --- HELPERS ---

/** The map center that puts `latlng` in the middle of the map left above the stop's sheet. */
function centerAbove(map: L.Map, latlng: L.LatLng, zoom: number): L.LatLng {
    const style = getComputedStyle(document.documentElement)
    const top = parseFloat(style.getPropertyValue("--map-top")) || 0
    const size = map.getSize()
    const sheet = size.y * VISIBLE.peek
    const wantedY = top + (size.y - sheet - top) / 2
    const point = map.project(latlng, zoom).add([0, size.y / 2 - wantedY])
    return map.unproject(point, zoom)
}

function fly(map: L.Map, center: L.LatLng, zoom: number) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        map.setView(center, zoom, { animate: false })
    } else {
        map.flyTo(center, zoom, { duration: FLIGHT_SECONDS, easeLinearity: 0.2 })
    }
}

// --- HOOK ---

/**
 * `stop` is the stop whose phone sheet is open. The view before the first stop is kept and
 * restored when the sheet closes, unless the map was moved by hand meanwhile or `forget` was
 * called (a stop picked as a place makes the map fit the new selection instead).
 */
export function useStopFlight(map: L.Map | null, stop: OpenStop | null) {
    const saved = useRef<{ center: L.LatLng; zoom: number } | null>(null)
    const moved = useRef(false)
    const flying = useRef(false)

    useEffect(() => {
        if (!map) return
        const onMove = () => {
            if (!flying.current) moved.current = true
        }
        const onEnd = () => {
            flying.current = false
        }
        map.on("dragstart zoomstart", onMove)
        map.on("moveend", onEnd)
        return () => {
            map.off("dragstart zoomstart", onMove)
            map.off("moveend", onEnd)
        }
    }, [map])

    useEffect(() => {
        if (!map) return
        if (stop) {
            if (!saved.current) {
                saved.current = { center: map.getCenter(), zoom: map.getZoom() }
                moved.current = false
            }
            const zoom = Math.min(Math.max(map.getZoom(), STOP_ZOOM), map.getMaxZoom())
            flying.current = true
            fly(map, centerAbove(map, stop.latlng, zoom), zoom)
            return
        }
        const back = saved.current
        saved.current = null
        if (back && !moved.current) {
            flying.current = true
            fly(map, back.center, back.zoom)
        }
    }, [map, stop])

    return {
        forget: () => {
            saved.current = null
        },
    }
}
