// Draws the network's lines and stops, and restyles them for the searched line or the selection

"use client"

import { useEffect, useEffectEvent, useRef, type RefObject } from "react"

import L from "leaflet"

import type { StopOption } from "@/app/_components/stop-picker"
import type { Network, NetworkLine, NetworkStop } from "@/features/network/network.service"

import { drawStripes, placeStripes, type Stripe } from "./bundles"
import { fitPadding } from "./fit-padding"
import type { LineFocus } from "./line-focus"
import { linesNear } from "./lines-near"
import { linesPopupContent } from "./lines-popup-content"
import { sortLines } from "./map-lines"
import type { Reachable } from "./network-map.schema"
import type {
    AdvisedLine,
    DrawnLine,
    NetworkLayers,
    OpenStop,
    PlaceKey,
    StopLook,
} from "./network-map.types"
import { rideNetwork } from "./ride-network"
import { STOP_STYLE, stopRadius, widenTouchTarget } from "./stop-dots"

// --- CONSTANTS ---

/** How long the line search must stand still before the map fits to the lines found. */
const FIT_DELAY_MS = 300

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
    /** The line the board says to take: shared roads of a ride take its colour. */
    advisedLine: AdvisedLine | null
}

interface LayerGroups {
    lines: L.LayerGroup
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
    advisedLine,
}: UseNetworkLayersOptions): RefObject<NetworkLayers> {
    const layersRef = useRef<NetworkLayers>({ lines: [], stops: [] })
    const groupsRef = useRef<LayerGroups | null>(null)
    const stripesRef = useRef<{
        stripes: Stripe[]
        key: string
        network: Network | null
        visible: Set<number> | null
    }>({ stripes: [], key: "", network: null, visible: null })

    // Layers are built once per network; their click handlers read the latest props.
    const currentPickTarget = useEffectEvent(() => pickTarget)
    const currentReachable = useEffectEvent(() => reachable)
    const hasSelection = useEffectEvent(() => Boolean(fromId || toId))
    const pick = useEffectEvent((key: PlaceKey, place: StopOption) => onPick(key, place))
    const openStop = useEffectEvent((stop: OpenStop) => onOpenStop(stop))
    const showLine = useEffectEvent((line: string) => onShowLine(line))
    const currentAdvised = useEffectEvent(() => advisedLine)
    /** Draws the lines in `visible` (all when null); one entry per line for hit-testing. */
    const drawLines = useEffectEvent(
        (
            map: L.Map,
            network: Network,
            group: L.LayerGroup,
            visible: Set<number> | null,
            key: string,
        ): DrawnLine[] => {
            const stripes = drawStripes(
                map,
                network,
                group,
                visible,
                currentAdvised(),
                (lines, event) =>
                    openLinesPopup(
                        map,
                        event,
                        lines[0] as NetworkLine,
                        layersRef.current,
                        (chosen) => {
                            showLine(chosen.line)
                            map.closePopup()
                        },
                    ),
            )
            stripesRef.current = { stripes, key, network, visible }
            // The canvas draws in the order layers arrive: put the stops back on top.
            for (const { layer } of layersRef.current.stops) layer.bringToFront()
            return stripes.flatMap(({ lines, layer }) => lines.map((line) => ({ line, layer })))
        },
    )

    useEffect(() => {
        if (!map) return
        const groups: LayerGroups = {
            lines: L.layerGroup().addTo(map),
            stops: L.layerGroup().addTo(map),
        }
        groupsRef.current = groups
        const onZoom = () => {
            placeStripes(map, stripesRef.current.stripes)
            for (const circle of layersRef.current.stops) {
                circle.layer.setRadius(stopRadius(circle.look, map.getZoom()))
            }
        }
        map.on("zoomend", onZoom)
        // The canvas holds plain colours: draw again when the theme changes.
        const onTheme = () => {
            const { network, visible } = stripesRef.current
            if (!network) return
            layersRef.current = {
                ...layersRef.current,
                lines: drawLines(map, network, groups.lines, visible, stripesRef.current.key),
            }
        }
        const scheme = window.matchMedia("(prefers-color-scheme: dark)")
        scheme.addEventListener("change", onTheme)
        const themeObserver = new MutationObserver(onTheme)
        themeObserver.observe(document.documentElement, { attributeFilter: ["data-theme"] })
        return () => {
            map.off("zoomend", onZoom)
            scheme.removeEventListener("change", onTheme)
            themeObserver.disconnect()
            for (const group of Object.values(groups)) group.remove()
            groupsRef.current = null
        }
    }, [map])

    const fittedRef = useRef(false)

    // Draw lines and stops once the network is in.
    useEffect(() => {
        const groups = groupsRef.current
        if (!map || !network || !groups) return
        groups.lines.clearLayers()
        groups.stops.clearLayers()

        const lines = drawLines(map, network, groups.lines, null, "all")

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

        // Only when the network first arrives (night lines coming and going redraw it too);
        // later selections move the map in the marker hook.
        if (network.stops.length > 0 && !fittedRef.current && !hasSelection()) {
            fittedRef.current = true
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

        // With origin and destination, only the stretches you ride are drawn, not whole lines,
        // merged like the network so lines riding the same street lie side by side.
        const segments = !query && reachable?.direction === "both" ? reachable.segments : null
        const ride = segments ? rideNetwork(network, segments) : null
        // Lines outside the focus are taken off the map, not faded: they cannot take you there.
        // The rest close up, so a bundle shows only the lines in focus.
        const visible = ride ? ride.visible : focusLines === null ? null : focus.indexes
        const advised = advisedLine ? `${advisedLine.mode}|${advisedLine.line}` : ""
        const key =
            (ride?.key ??
                (visible === null ? "all" : [...visible].sort((a, b) => a - b).join(","))) +
            (visible === null ? "" : `@${advised}`)
        if (key !== stripesRef.current.key) {
            layersRef.current = {
                ...layersRef.current,
                lines: drawLines(map, ride?.network ?? network, groups.lines, visible, key),
            }
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
        layersRef.current = { ...layersRef.current, stops }

        if (query && matchingLines.length > 0) {
            const points = network.corridors
                .filter((corridor) => corridor.lines.some((index) => focus.indexes.has(index)))
                .flatMap((corridor) => corridor.path)
            if (points.length > 0) {
                // Typing "28" searches "2" first. Fit once the query settles: a fit started
                // during the previous fit's zoom animation is dropped by Leaflet.
                const timer = window.setTimeout(
                    () => map.fitBounds(L.latLngBounds(points), fitPadding(20)),
                    FIT_DELAY_MS,
                )
                return () => window.clearTimeout(timer)
            }
        }
    }, [map, network, reachable, query, matchingLines, focus, advisedLine])

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
    const found = linesNear(map, event.containerPoint, layers.lines)
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
