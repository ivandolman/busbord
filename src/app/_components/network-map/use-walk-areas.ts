// Draws where you can walk from the origin and to the destination

"use client"

import { useEffect } from "react"

import L from "leaflet"

import { fetchParsed } from "./fetch-parsed"
import { WalkAreaSchema } from "./network-map.schema"

// --- CONSTANTS ---

const ENDS = [
    { role: "from", color: "#2f6fed" },
    { role: "to", color: "#e5484d" },
] as const

// --- INTERFACES ---

interface UseWalkAreasOptions {
    map: L.Map | null
    fromId: string | null
    toId: string | null
    walk: boolean
    walkQuery: string | null
}

// --- HOOK ---

/**
 * Where you can walk from the origin (blue: stops inside count to get on) and to the destination
 * (red: where you can get off). Along real streets and footpaths, the same limit as the board;
 * a circle when the server has no road network.
 */
export function useWalkAreas({ map, fromId, toId, walk, walkQuery }: UseWalkAreasOptions): void {
    useEffect(() => {
        if (!map || walkQuery === null || (!fromId && !toId)) return
        const controller = new AbortController()
        const group = L.layerGroup().addTo(map)
        for (const end of ENDS) {
            const id = end.role === "from" ? fromId : toId
            if (!id) continue
            const query = new URLSearchParams(`${walkQuery}&walk=${walk ? "1" : "0"}`)
            query.set("id", id)
            query.set("role", end.role)
            fetchParsed(`/api/walk-area?${query}`, WalkAreaSchema, controller.signal)
                .then((body) => {
                    if (body.radiusMeters <= 0) return
                    // "Loopgebied" in the design: a light fill inside a dashed edge.
                    const style: L.PathOptions = {
                        color: end.color,
                        weight: 1.5,
                        opacity: 0.7,
                        dashArray: "6 5",
                        fillOpacity: 0.13,
                        interactive: false,
                    }
                    const shape = body.polygon
                        ? L.polygon(body.polygon, { ...style, smoothFactor: 1.5 })
                        : L.circle(body.center, { ...style, radius: body.radiusMeters })
                    shape.addTo(group)
                    shape.bringToBack()
                    // "binnen ~12 min lopen" on the bottom edge of the origin's area.
                    if (end.role === "from" && body.minutes) {
                        const bounds = shape.getBounds()
                        L.marker([bounds.getSouth(), bounds.getCenter().lng], {
                            interactive: false,
                            keyboard: false,
                            icon: L.divIcon({
                                className: "",
                                iconSize: [0, 0],
                                html: `<div class="map-label map-label-walk">binnen ~${body.minutes} min lopen</div>`,
                            }),
                        }).addTo(group)
                    }
                })
                .catch(() => {})
        }
        return () => {
            controller.abort()
            group.remove()
        }
    }, [map, fromId, toId, walk, walkQuery])
}
