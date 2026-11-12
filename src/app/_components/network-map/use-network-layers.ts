// Draws the network's lines and stops, and restyles them for the searched line or the selection

"use client"

import { useEffect, useEffectEvent, useRef, type RefObject } from "react"

import L from "leaflet"

import type { StopOption } from "@/app/_components/stop-picker"
import type { Network, NetworkLine, NetworkStop } from "@/features/network/network.service"

import { fitPadding } from "./fit-padding"
import type { LineFocus } from "./line-focus"
import { linesNear } from "./lines-near"
import { linesPopupContent } from "./lines-popup-content"
import { lineColor, sortLines } from "./map-lines"
import type { Reachable } from "./network-map.schema"
import type { DrawnLine, NetworkLayers, OpenStop, PlaceKey, StopLook } from "./network-map.types"
import { STOP_STYLE, stopRadius, widenTouchTarget } from "./stop-dots"

// --- CONSTANTS ---

/** Dark casing under ridden stretches ("Rand lijn" in the design). */
const CASING = "#1b2230"

/** Below this width the app is a phone layout: map full screen under a bottom sheet. */
const PHONE_QUERY = "(max-width: 1023px)"

// --- INTERFACES ---

interface UseNetworkLayersOptions {
    map: L.Map | null
    network: Network | null
    reachable: Reachable | null
    /** The searched line number, trimmed and lower case; empty without a search. */
    query: string
    matchingLines: NetworkLine[]
    focus: LineFocus | null
    fromId: string | null
    toId: string | null
    pickTarget: PlaceKey | null
    onPick: (key: PlaceKey, place: StopOption) => void
    onOpenStop: (stop: OpenStop) => void
    /** "Show only this line" in the lines popup. */
    onShowLine: (line: string) => void
}

interface LayerGroups {
    lines: L.LayerGroup
    segments: L.LayerGroup
    stops: L.LayerGroup
}

// --- HOOK ---

export function useNetworkLayers({
    map,
    network,
    reachable,
    query,
    matchingLines,
    focus,
    fromId,
    toId,
    pickTarget,
    onPick,
    onOpenStop,
    onShowLine,
}: UseNetworkLayersOptions): RefObject<NetworkLayers> {
    const layersRef = useRef<NetworkLayers>({ lines: [], segments: [], stops: [] })
    const groupsRef = useRef<LayerGroups | null>(null)

    // Layers are built once per network; their click handlers read the latest props.
    const currentPickTarget = useEffectEvent(() => pickTarget)
    const currentReachable = useEffectEvent(() => reachable)
    const hasSelection = useEffectEvent(() => Boolean(fromId || toId))
    const pick = useEffectEvent((key: PlaceKey, place: StopOption) => onPick(key, place))
    const openStop = useEffectEvent((stop: OpenStop) => onOpenStop(stop))
    const showLine = useEffectEvent((line: string) => onShowLine(line))

    useEffect(() => {
        if (!map) return
        const groups: LayerGroups = {
            lines: L.layerGroup().addTo(map),
            segments: L.layerGroup().addTo(map),
            stops: L.layerGroup().addTo(map),
        }
        groupsRef.current = groups
        const onZoom = () => {
            for (const circle of layersRef.current.stops) {
                circle.layer.setRadius(stopRadius(circle.look, map.getZoom()))
            }
        }
        map.on("zoomend", onZoom)
        return () => {
            map.off("zoomend", onZoom)
            for (const group of Object.values(groups)) group.remove()
            groupsRef.current = null
        }
    }, [map])

    // Draw lines and stops once the network is in.
    useEffect(() => {
        const groups = groupsRef.current
        if (!map || !network || !groups) return
        groups.lines.clearLayers()
        groups.stops.clearLayers()

        const lines = network.lines.flatMap((line) =>
            line.paths.map((path) => {
                const layer = L.polyline(path, { weight: 3, color: lineColor(line), opacity: 0.8 })
                layer.on("click", (event: L.LeafletMouseEvent) =>
                    openLinesPopup(map, event, line, layersRef.current, (chosen) => {
                        showLine(chosen.line)
                        map.closePopup()
                    }),
                )
                layer.addTo(groups.lines)
                return { line, layer }
            }),
        )

        const stops = network.stops.map((stop) => {
            const layer = L.circleMarker([stop.lat, stop.lon], {
                ...STOP_STYLE.normal,
                radius: stopRadius("normal", map.getZoom()),
            })
            widenTouchTarget(layer)
            layer.on("click", (event: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(event)
                const target = currentPickTarget()
                if (target) {
                    pick(target, { id: stop.id, name: stop.name })
                    return
                }
                openStop({
                    stop,
                    served: servedLines(stop, network),
                    note: stopNote(stop, currentReachable()),
                    latlng: event.latlng,
                    phone: window.matchMedia(PHONE_QUERY).matches,
                    key: Date.now(),
                })
            })
            layer.addTo(groups.stops)
            return { stop, layer, look: "normal" as StopLook }
        })

        layersRef.current = { ...layersRef.current, lines, stops }

        // Only when the network arrives; later selections move the map in the marker hook.
        if (network.stops.length > 0 && !hasSelection()) {
            map.fitBounds(
                L.latLngBounds(network.stops.map((stop) => [stop.lat, stop.lon])),
                fitPadding(10),
            )
        }
    }, [map, network])

    // Restyle on every change of focus: a searched line, or what is reachable from the origin.
    useEffect(() => {
        const groups = groupsRef.current
        if (!map || !network || !focus || !groups) return
        const focusLines = focus.lineIds

        // With origin and destination, only the stretches you ride are drawn, not whole lines.
        const segments = !query && reachable?.direction === "both" ? reachable.segments : null
        groups.segments.clearLayers()
        const drawnSegments: DrawnLine[] = []
        if (segments) {
            const linesById = new Map(network.lines.map((line) => [line.id, line]))
            for (const segment of segments) {
                const line = linesById.get(segment.routeId)
                if (!line) continue
                // The design's "Rand lijn": a dark casing under the line's colour.
                const casing = L.polyline(segment.path, {
                    color: CASING,
                    weight: 9,
                    opacity: 0.85,
                    interactive: false,
                })
                const layer = L.polyline(segment.path, {
                    color: lineColor(line),
                    weight: 6,
                    opacity: 1,
                })
                layer.on("click", (event: L.LeafletMouseEvent) =>
                    openLinesPopup(map, event, line, layersRef.current, (chosen) => {
                        showLine(chosen.line)
                        map.closePopup()
                    }),
                )
                groups.segments.addLayer(casing)
                groups.segments.addLayer(layer)
                // Under the stops, so a click on a stop still opens the stop.
                layer.bringToBack()
                casing.bringToBack()
                drawnSegments.push({ line, layer })
            }
        }

        // Lines outside the focus are taken off the map, not faded: they cannot take you there.
        for (const { line, layer } of layersRef.current.lines) {
            const focused = segments === null && (focusLines === null || focusLines.has(line.id))
            if (!focused) {
                groups.lines.removeLayer(layer)
                continue
            }
            layer.setStyle({
                color: lineColor(line),
                weight: focusLines === null ? 3 : 5,
                opacity: focusLines === null ? 0.8 : 1,
            })
            if (!groups.lines.hasLayer(layer)) groups.lines.addLayer(layer)
        }

        const stops = layersRef.current.stops.map((circle) => {
            const { stop, layer } = circle
            // A ride ends at its platform; draw the stop there rather than at the middle of the area.
            const [lat, lon] = (!query && stopPosition(stop, reachable)) || [stop.lat, stop.lon]
            const at = layer.getLatLng()
            if (at.lat !== lat || at.lng !== lon) layer.setLatLng([lat, lon])
            let look: StopLook = "normal"
            if (query) {
                look = stop.lines.some((index) => focus.indexes.has(index)) ? "focus" : "faded"
            } else if (reachable) {
                look = stop.areaIds.some((id) => reachable.areas.has(id)) ? "focus" : "faded"
            }
            layer.setStyle({ ...STOP_STYLE[look], radius: stopRadius(look, map.getZoom()) })
            if (look === "focus") layer.bringToFront()
            return { ...circle, look }
        })
        layersRef.current = { ...layersRef.current, segments: drawnSegments, stops }

        if (query && matchingLines.length > 0) {
            const points = matchingLines.flatMap((line) => line.paths.flat())
            if (points.length > 0) map.fitBounds(L.latLngBounds(points), fitPadding(20))
        }
    }, [map, network, reachable, query, matchingLines, focus])

    return layersRef
}

// --- HELPERS ---

/** Popup with every line under the pointer; `fallback` is the line that was hit. */
function openLinesPopup(
    map: L.Map,
    event: L.LeafletMouseEvent,
    fallback: NetworkLine,
    layers: NetworkLayers,
    onShowOnly: (line: NetworkLine) => void,
): void {
    L.DomEvent.stopPropagation(event)
    const found = linesNear(map, event.containerPoint, [...layers.lines, ...layers.segments])
    if (found.length === 0) found.push(fallback)
    L.popup({ maxWidth: 320, className: "card-popup" })
        .setLatLng(event.latlng)
        .setContent(linesPopupContent(found, onShowOnly))
        .openOn(map)
}

/** Line numbers the network knows at a stop, sorted, each once. */
function servedLines(stop: NetworkStop, network: Network): string[] {
    return stop.lines
        .map((index) => network.lines[index])
        .filter((line): line is NetworkLine => line !== undefined)
        .sort(sortLines)
        .map((line) => line.line)
        .filter((value, index, all) => value && all.indexOf(value) === index)
}

/** Why a stop does not help for the selection, or null when it does (or nothing is selected). */
function stopNote(stop: NetworkStop, reachable: Reachable | null): string | null {
    if (!reachable || stop.areaIds.some((id) => reachable.areas.has(id))) return null
    if (reachable.direction === "to") return "Vanaf hier geen rechtstreekse rit naar je bestemming."
    if (reachable.direction === "both") return "Geen van de lijnen naar je bestemming komt hier."
    return "Geen rechtstreekse rit vanaf je vertrekpunt."
}

/** The middle of the platforms the rides use at this stop, or null when they use none. */
function stopPosition(stop: NetworkStop, reachable: Reachable | null): [number, number] | null {
    const points = stop.areaIds
        .map((id) => reachable?.positions.get(id))
        .filter((point) => point !== undefined)
    if (points.length === 0) return null
    return [
        points.reduce((sum, point) => sum + point[0], 0) / points.length,
        points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ]
}
