// Keeps the stop labels in view up to date, with the next ride towards the destination per line

"use client"

import { useEffect, useEffectEvent, useRef, type RefObject } from "react"

import L from "leaflet"

import type { Network } from "@/features/network/network.service"

import { fetchParsed } from "./fetch-parsed"
import type { LineFocus } from "./line-focus"
import { NextDeparturesSchema, type Reachable } from "./network-map.schema"
import type { NetworkLayers } from "./network-map.types"
import { drawStopLabels, isBoarding, labelledStops, type AreaTimes } from "./stop-labels"

// --- CONSTANTS ---

const TIMES_REFRESH_MS = 30_000

/** Stop areas asked for at once for label times (the API refuses more than 120). */
const NEXT_TIMES_MAX_AREAS = 120

// --- INTERFACES ---

interface UseStopLabelsOptions {
    map: L.Map | null
    network: Network | null
    layersRef: RefObject<NetworkLayers>
    focus: LineFocus | null
    reachable: Reachable | null
    toId: string | null
    walk: boolean
    walkQuery: string | null
}

/**
 * Next ride per line towards the destination, per stop area, for the stops in view. `key` is
 * the selection it belongs to; labels ignore times of another selection.
 */
interface NextTimes {
    key: string
    areas: AreaTimes
}

// --- HOOK ---

export function useStopLabels({
    map,
    network,
    layersRef,
    focus,
    reachable,
    toId,
    walk,
    walkQuery,
}: UseStopLabelsOptions): void {
    const groupRef = useRef<L.LayerGroup | null>(null)
    const nextTimesRef = useRef<NextTimes>({ key: "", areas: new Map() })

    const updateLabels = useEffectEvent(() => {
        const group = groupRef.current
        if (!map || !network || !group) return
        const { key, areas } = nextTimesRef.current
        drawStopLabels({
            map,
            group,
            candidates: labelledStops(map, layersRef.current.stops, network, focus?.labels ?? null),
            times: toId && key.startsWith(`${toId}|${walk}|`) ? areas : null,
            reachable,
            now: Math.floor(Date.now() / 1000),
        })
    })

    /** Stops whose labels may carry times: the in-focus stops in view, busiest first. */
    const timedAreaIds = useEffectEvent(() => {
        if (!map || !network) return []
        const stops = labelledStops(map, layersRef.current.stops, network, focus?.labels ?? null)
            .map((circle) => circle.stop)
            .filter((stop) => isBoarding(stop, reachable))
        return [...new Set(stops.flatMap((stop) => stop.areaIds))].slice(0, NEXT_TIMES_MAX_AREAS)
    })

    useEffect(() => {
        if (!map) return
        const group = L.layerGroup().addTo(map)
        groupRef.current = group
        const onMove = () => updateLabels()
        map.on("moveend", onMove)
        return () => {
            map.off("moveend", onMove)
            group.remove()
            groupRef.current = null
        }
    }, [map])

    // After every restyle: labels list only the lines in focus.
    useEffect(() => {
        updateLabels()
    }, [map, network, focus])

    // With a destination, labels show when each line next leaves towards it (the chosen direction):
    // fetched for the stops in view after every move and every half minute.
    useEffect(() => {
        if (!map || !network || !toId) {
            nextTimesRef.current = { key: "", areas: new Map() }
            updateLabels()
            return
        }
        if (walkQuery === null) return
        const key = `${toId}|${walk}|${walkQuery}`
        let controller: AbortController | null = null
        let debounce: ReturnType<typeof setTimeout> | null = null
        const load = () => {
            const areaIds = timedAreaIds()
            if (areaIds.length === 0) return
            controller?.abort()
            controller = new AbortController()
            const query = new URLSearchParams(`${walkQuery}&walk=${walk ? "1" : "0"}`)
            query.set("to", toId)
            query.set("areas", areaIds.join(","))
            fetchParsed(`/api/next-departures?${query}`, NextDeparturesSchema, controller.signal)
                .then((body) => {
                    // Keep times of stops just scrolled away: moving back shows them at once.
                    const areas: AreaTimes =
                        nextTimesRef.current.key === key ? nextTimesRef.current.areas : new Map()
                    for (const [id, list] of Object.entries(body.areas)) areas.set(id, list)
                    nextTimesRef.current = { key, areas }
                    updateLabels()
                })
                .catch(() => {
                    // Labels keep their line numbers without times.
                })
        }
        const schedule = () => {
            if (debounce) clearTimeout(debounce)
            debounce = setTimeout(load, 300)
        }
        load()
        map.on("moveend", schedule)
        const timer = setInterval(load, TIMES_REFRESH_MS)
        return () => {
            map.off("moveend", schedule)
            clearInterval(timer)
            if (debounce) clearTimeout(debounce)
            controller?.abort()
        }
    }, [map, network, toId, walk, reachable, walkQuery])
}
