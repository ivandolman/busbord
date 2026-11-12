// Draws the walks of the departure picked on the board and zooms the map to them

"use client"

import { useEffect, useEffectEvent } from "react"

import L from "leaflet"

import { fetchParsed } from "./fetch-parsed"
import { fitPadding } from "./fit-padding"
import { WalkRouteSchema } from "./network-map.schema"
import type { WalkLeg } from "./network-map.types"

// --- HOOK ---

/**
 * The walks of the departure picked on the board, dashed along the real streets, with the stop
 * at the bus end marked. The map zooms to them.
 */
export function useWalkLegs(map: L.Map | null, walkLegs: WalkLeg[]): void {
    // The board passes a new array on every render; redraw only when the walks themselves change.
    const legsKey = JSON.stringify(walkLegs)
    const currentLegs = useEffectEvent(() => walkLegs)

    useEffect(() => {
        const legs = currentLegs()
        if (!map || legs.length === 0) return
        const controller = new AbortController()
        const group = L.layerGroup().addTo(map)
        Promise.all(
            legs.map((leg) =>
                fetchParsed(
                    `/api/walk-route?${new URLSearchParams({ from: pointParam(leg.from), to: pointParam(leg.to) })}`,
                    WalkRouteSchema,
                    controller.signal,
                ).catch(() => ({ path: null })),
            ),
        ).then((results) => {
            if (controller.signal.aborted) return
            const all: [number, number][] = []
            legs.forEach((leg, i) => {
                const route = results[i]?.path
                const path: [number, number][] = route
                    ? [leg.from, ...route, leg.to]
                    : [leg.from, leg.to]
                const color = leg.kind === "to" ? "#2f6fed" : "#e5484d"
                L.polyline(path, {
                    color: "#ffffff",
                    weight: 8,
                    opacity: 0.9,
                    interactive: false,
                }).addTo(group)
                L.polyline(path, {
                    color,
                    weight: 5,
                    dashArray: "1 10",
                    lineCap: "round",
                    interactive: false,
                }).addTo(group)
                const stop = leg.kind === "to" ? leg.to : leg.from
                L.circleMarker(stop, {
                    radius: 8,
                    color: "#111418",
                    weight: 3,
                    fillColor: "#ffffff",
                    fillOpacity: 1,
                    interactive: false,
                })
                    .bindTooltip(
                        leg.kind === "to"
                            ? `Hier opstappen: ${leg.label}`
                            : `Hier uitstappen: ${leg.label}`,
                        {
                            permanent: true,
                            direction: "bottom",
                            offset: [0, 10],
                            className:
                                leg.kind === "to"
                                    ? "map-label map-label-board"
                                    : "map-label map-label-alight",
                        },
                    )
                    .addTo(group)
                all.push(...path)
            })
            if (all.length > 0) {
                map.fitBounds(L.latLngBounds(all), { ...fitPadding(50), maxZoom: 17 })
            }
        })
        return () => {
            controller.abort()
            group.remove()
        }
    }, [map, legsKey])
}

// --- HELPERS ---

/** A point id as /api/walk-route takes it. */
function pointParam([lat, lon]: [number, number]): string {
    return `@${lat.toFixed(5)},${lon.toFixed(5)}`
}
