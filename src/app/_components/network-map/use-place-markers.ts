// Draws the origin and destination markers and fits the map to them

"use client"

import { useEffect, useMemo } from "react"

import L from "leaflet"

import type { Network } from "@/features/network/network.service"
import { parsePointId } from "@/lib/place"

import { fitPadding } from "./fit-padding"
import { destinationIcon, originIcon } from "./map-markers"
import { MAP_REVEAL_EVENT } from "./use-leaflet-map"

// --- INTERFACES ---

interface UsePlaceMarkersOptions {
    map: L.Map | null
    network: Network | null
    fromId: string | null
    toId: string | null
    walk: boolean
}

// --- HOOK ---

export function usePlaceMarkers({
    map,
    network,
    fromId,
    toId,
    walk,
}: UsePlaceMarkersOptions): void {
    // Every stop area of a merged stop finds it, whichever id the selection uses.
    const stopsById = useMemo(
        () =>
            new Map(
                network?.stops.flatMap((stop) => stop.areaIds.map((id) => [id, stop] as const)) ??
                    [],
            ),
        [network],
    )

    useEffect(() => {
        if (!map) return
        const group = L.layerGroup().addTo(map)
        const position = (id: string | null): L.LatLngTuple | null => {
            if (!id) return null
            const point = parsePointId(id)
            if (point) return [point.lat, point.lon]
            const stop = stopsById.get(id)
            return stop ? [stop.lat, stop.lon] : null
        }
        const from = position(fromId)
        const to = position(toId)
        if (from)
            L.marker(from, { icon: originIcon(), keyboard: false, interactive: false }).addTo(group)
        if (to) {
            L.marker(to, { icon: destinationIcon(), keyboard: false, interactive: false }).addTo(
                group,
            )
        }
        const known = [from, to].filter((value): value is L.LatLngTuple => value !== null)
        const fit = () => {
            if (known.length > 0) {
                map.fitBounds(L.latLngBounds(known), {
                    ...fitPadding(60),
                    maxZoom: known.length === 2 ? 15 : 14,
                })
            } else if (stopsById.size > 0) {
                map.fitBounds(
                    L.latLngBounds([...stopsById.values()].map((stop) => [stop.lat, stop.lon])),
                    fitPadding(10),
                )
            }
        }
        // A map that was hidden while this ran fitted a 0x0 view: fit again once it shows.
        map.on(MAP_REVEAL_EVENT, fit)
        const [only] = known
        if (known.length === 2 || (known.length === 1 && only && !map.getBounds().contains(only))) {
            fit()
        }
        return () => {
            map.off(MAP_REVEAL_EVENT, fit)
            group.remove()
        }
        // walk is not read, but a change of it re-checks the view like the selection does.
    }, [map, fromId, toId, walk, stopsById])
}
