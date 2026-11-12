// The network map: every line and stop, narrowed to the selection, with a stop card per stop

"use client"

import { useMemo, useState } from "react"
import { createPortal } from "react-dom"

import "leaflet/dist/leaflet.css"

import type { StopOption } from "@/app/_components/stop-picker"
import type { StopBoard } from "@/features/board/board.types"
import type { Network, NetworkLine } from "@/features/network/network.service"
import { useNetwork } from "@/hooks/use-network"
import { useSettings, walkParams } from "@/hooks/use-settings"

import { lineFocus } from "./line-focus"
import LineSearch from "./line-search"
import MapLegend from "./map-legend"
import { sortLines } from "./map-lines"
import type { Reachable } from "./network-map.schema"
import type { OpenStop, PlaceKey, WalkLeg } from "./network-map.types"
import StopCard from "./stop-card"
import StopSheet from "./stop-sheet"
import { useLeafletMap } from "./use-leaflet-map"
import { useNetworkLayers } from "./use-network-layers"
import { usePlaceMarkers } from "./use-place-markers"
import { useReachable } from "./use-reachable"
import { useStopDepartures } from "./use-stop-departures"
import { useStopLabels } from "./use-stop-labels"
import { useWalkAreas } from "./use-walk-areas"
import { useWalkLegs } from "./use-walk-legs"

// --- INTERFACES ---

interface NetworkMapProps {
    fromId: string | null
    toId: string | null
    walk: boolean
    /** Walks to draw for a departure picked on the board. */
    walkLegs?: WalkLeg[]
    onPick: (key: PlaceKey, place: StopOption) => void
    /** Set while the user is choosing a place on the map: the next tap picks it directly. */
    pickTarget?: PlaceKey | null
    /** Phone only: show the line search field (on a wide screen it is always there). */
    lineSearchOpen?: boolean
}

/** What the legend line depends on. */
interface LegendState {
    failed: boolean
    network: Network | null
    query: string
    lineQuery: string
    matchingLines: NetworkLine[]
    pickTarget: PlaceKey | null
    reachable: Reachable | null
}

// --- COMPONENT ---

export default function NetworkMap({
    fromId,
    toId,
    walk,
    walkLegs = [],
    onPick,
    pickTarget = null,
    lineSearchOpen = false,
}: NetworkMapProps) {
    const { settings, loaded: settingsLoaded } = useSettings()
    // Walking settings as query parameters; a change refetches everything that depends on them.
    const walkQuery = settingsLoaded ? new URLSearchParams(walkParams(settings)).toString() : null
    const { network, failed } = useNetwork()
    const [lineQuery, setLineQuery] = useState("")
    /** The stop whose card is open: a popup next to it, or the bottom sheet on a phone. */
    const [openStop, setOpenStop] = useState<OpenStop | null>(null)

    const { map, containerRef } = useLeafletMap({ mapStyle: settings.mapStyle, pickTarget, onPick })
    const reachable = useReachable({ fromId, toId, walk, walkQuery })
    const stopCard = useStopDepartures({
        map,
        openStop,
        onDismiss: (key) => setOpenStop((current) => (current?.key === key ? null : current)),
        fromId,
        toId,
        walk,
        walkQuery,
    })

    const query = lineQuery.trim().toLowerCase()
    const matchingLines = useMemo(
        () =>
            network && query
                ? network.lines.filter((line) => line.line.toLowerCase() === query)
                : [],
        [network, query],
    )
    const focus = useMemo(
        () => (network ? lineFocus(network, query, matchingLines, reachable) : null),
        [network, query, matchingLines, reachable],
    )
    const layersRef = useNetworkLayers({
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
        onOpenStop: setOpenStop,
        onShowLine: setLineQuery,
    })
    useStopLabels({ map, network, layersRef, focus, reachable, toId, walk, walkQuery })
    useWalkAreas({ map, fromId, toId, walk, walkQuery })
    useWalkLegs(map, walkLegs)
    usePlaceMarkers({ map, network, fromId, toId, walk })

    const lineSuggestions = useMemo(() => uniqueLines(network), [network])

    const card = openStop ? (
        <StopCard
            name={openStop.stop.name}
            lines={cardLines(openStop.served, stopCard.board)}
            note={openStop.note}
            board={stopCard.board}
            failed={stopCard.failed}
            direction={stopCard.direction}
            now={stopCard.now}
            onDirection={stopCard.setDirection}
            onPick={(key) => {
                onPick(key, { id: openStop.stop.id, name: openStop.stop.name })
                setOpenStop(null)
            }}
            onClose={() => setOpenStop(null)}
        />
    ) : null

    const legend = legendMessage({
        failed,
        network,
        query,
        lineQuery,
        matchingLines,
        pickTarget,
        reachable,
    })

    return (
        <div className="relative h-full">
            <div
                ref={containerRef}
                className="absolute inset-0"
                aria-label="Kaart met alle lijnen en haltes"
            />
            <LineSearch
                value={lineQuery}
                onChange={setLineQuery}
                suggestions={lineSuggestions}
                open={lineSearchOpen}
            />
            {legend && <MapLegend message={legend} picking={pickTarget !== null} />}
            {/* The stop card: in its popup on a wide screen; on a phone a sheet in <body>. */}
            {card && stopCard.popupHost && createPortal(card, stopCard.popupHost)}
            {card && openStop?.phone && <StopSheet stopName={openStop.stop.name}>{card}</StopSheet>}
        </div>
    )
}

// --- HELPERS ---

/** One line per line number, in line order, for the search suggestions. */
function uniqueLines(network: Network | null): NetworkLine[] {
    if (!network) return []
    const unique = new Map<string, NetworkLine>()
    for (const line of [...network.lines].sort(sortLines)) {
        if (line.line && !unique.has(line.line)) unique.set(line.line, line)
    }
    return [...unique.values()]
}

/** The lines the network knows at the stop plus any its departures add, sorted, each once. */
function cardLines(served: string[], board: StopBoard | null): string[] {
    return [
        ...new Set([...served, ...(board?.departures.map((departure) => departure.line) ?? [])]),
    ]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "nl", { numeric: true }))
}

function legendMessage({
    failed,
    network,
    query,
    lineQuery,
    matchingLines,
    pickTarget,
    reachable,
}: LegendState): string | null {
    if (failed) return "Kaart kon niet laden."
    if (!network) return "Lijnen laden…"
    if (query && matchingLines.length === 0) return `Geen lijn ${lineQuery} gevonden.`
    if (pickTarget) {
        return `Tik op een halte of plek: wordt je ${pickTarget === "from" ? "vertrekpunt" : "bestemming"}.`
    }
    if (reachable && !query && reachable.routes.size === 0)
        return "Geen rechtstreekse lijn vandaag."
    return null
}
