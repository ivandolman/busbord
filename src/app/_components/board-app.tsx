// The app on "/": the sheet or side panel with the board, search and settings, next to the map

"use client"

import { useState } from "react"
import dynamic from "next/dynamic"

import type { PlaceKey } from "@/app/_components/network-map/network-map.types"
import LeaveAlertSwitch from "@/app/_components/settings/leave-alert-switch"
import SavedRoutesRow from "@/app/_components/settings/saved-routes-row"
import SettingsPanel from "@/app/_components/settings/settings-panel"
import LogoutRow from "@/components/app/logout-row"
import { Sheet, type SheetSnap } from "@/components/ui/sheet"
import type { Departure } from "@/features/board/board.types"
import { overview } from "@/features/board/group"
import { sameRoute, type SavedRoute } from "@/features/saved-routes/saved-routes"
import { useBoard } from "@/hooks/use-board"
import { useLeaveAlert } from "@/hooks/use-leave-alert"
import { useLocate } from "@/hooks/use-locate"
import { usePlaceNames } from "@/hooks/use-place-names"
import { useRouteParams } from "@/hooks/use-route-params"
import { useSavedRoutes } from "@/hooks/use-saved-routes"
import { useScheduledRoute } from "@/hooks/use-scheduled-route"
import { useSettings, walkParams } from "@/hooks/use-settings"
import { useShownTrip } from "@/hooks/use-shown-trip"

import BoardPanel from "./board-panel"
import DesktopHeader from "./desktop-header"
import MapControls from "./map-controls"
import SearchPanel from "./search-panel"
import { type StopOption } from "./stop-picker"
import TripView from "./trip-view"

// --- CONSTANTS ---

// Leaflet touches `window` on import, so the map only ever loads in the browser.
const NetworkMap = dynamic(() => import("@/app/_components/network-map/network-map"), {
    ssr: false,
    loading: () => <p className="text-body-s text-muted p-4 pt-24 lg:pt-4">Kaart laden…</p>,
})

/** What the sheet (phone) or side panel (wide screen) shows. */
type Panel = "board" | "search" | "settings" | "trip"

const PANEL_LABEL: Record<Panel, string> = {
    board: "Vertrekbord",
    search: "Van en naar",
    settings: "Kaart en instellingen",
    trip: "Rit",
}

// --- INTERFACES ---

interface BoardAppProps {
    /** The app sits behind a login (src/lib/auth.ts), so offer "Uitloggen". */
    loginEnabled?: boolean
}

// --- COMPONENT ---

export default function BoardApp({ loginEnabled = false }: BoardAppProps) {
    const { fromId, toId, walk, updateUrl } = useRouteParams()
    const { names, remember } = usePlaceNames(fromId, toId)
    const { routes: savedRoutes } = useSavedRoutes()
    const { settings, loaded: settingsLoaded } = useSettings()
    const { board, status, offline, now } = useBoard({
        fromId,
        toId,
        walk,
        walkQuery: new URLSearchParams(walkParams(settings)).toString(),
        ready: settingsLoaded,
        onBoard: (next) => remember(next.origin, next.destination),
    })

    const [panel, setPanel] = useState<Panel>("board")
    const [snap, setSnap] = useState<SheetSnap>("peek")
    /** Set while choosing a place by tapping the map. */
    const [pickTarget, setPickTarget] = useState<PlaceKey | null>(null)
    const [lineSearchOpen, setLineSearchOpen] = useState(false)
    /** Phone: a stop's sheet is open, so the board's sheet slides out of its way. */
    const [stopSheetOpen, setStopSheetOpen] = useState(false)

    const open = (next: Panel, at: SheetSnap) => {
        setPanel(next)
        setSnap(at)
    }

    const pick = (key: PlaceKey, stop: StopOption | null) => {
        if (stop) remember(stop)
        // Picking the stop that is already on the other side swaps them instead of clearing the board.
        const other = key === "from" ? toId : fromId
        if (stop && stop.id === other) updateUrl({ from: toId, to: fromId })
        else updateUrl({ [key]: stop?.id ?? null })
        if (pickTarget) setPickTarget(null)
        // With both places known the board is what you want to see; otherwise ask for the other one.
        if (stop && other) open("board", "peek")
        else if (stop && pickTarget) open("search", "full")
    }

    const openRoute = (route: SavedRoute) => {
        remember(route.from, route.to)
        updateUrl({ from: route.from.id, to: route.to.id, walk: route.walk ? null : "0" })
        open("board", "peek")
    }

    /** Tapping the saved route already on screen clears it again. */
    const toggleRoute = (route: SavedRoute) => {
        if (sameRoute(route, fromId, toId)) clearRoute()
        else openRoute(route)
    }

    const clearRoute = () => {
        updateUrl({ from: null, to: null })
        open("board", "peek")
    }

    const autoOpened = useScheduledRoute(fromId, toId, openRoute)
    const { locate, failed: locationFailed } = useLocate((place) => pick("from", place))

    const boardMatches =
        board !== null && board.origin.id === fromId && board.destination.id === toId
    const currentBoard = boardMatches ? board : null
    const trip = useShownTrip(fromId, toId, currentBoard)
    // The map draws a shared road in the colour of the line the board says to take.
    const advised = currentBoard
        ? overview(currentBoard.departures, currentBoard.origin.name).pick
        : null
    // A new route drops the ride shown, and with it the trip panel.
    const visiblePanel: Panel = panel === "trip" && !trip.shown ? "board" : panel

    // "Vertrek nu" for the saved regular trip that is on screen.
    const savedRoute = savedRoutes.find((route) => sameRoute(route, fromId, toId)) ?? null
    useLeaveAlert(currentBoard, savedRoute, now)

    const from = fromId ? { id: fromId, name: names[fromId] ?? "" } : null
    const to = toId ? { id: toId, name: names[toId] ?? "" } : null
    const swap = () => updateUrl({ from: toId, to: fromId })
    const openSearch = () => open("search", "full")
    const backToBoard = () => open("board", "peek")

    const showRoute = (departure: Departure) => {
        // The sheet folds down so the walks on the map are in view.
        if (trip.show(departure, board)) open("trip", "peek")
    }

    const closeTrip = () => {
        trip.clear()
        backToBoard()
    }

    const content =
        visiblePanel === "trip" && trip.departure && currentBoard ? (
            <TripView
                departure={trip.departure}
                board={currentBoard}
                now={now}
                onClose={closeTrip}
            />
        ) : visiblePanel === "search" ? (
            <SearchPanel
                from={from}
                to={to}
                walk={walk}
                locationFailed={locationFailed}
                onChange={pick}
                onSwap={swap}
                onLocate={locate}
                onChooseOnMap={() => {
                    setPickTarget(!fromId ? "from" : "to")
                    backToBoard()
                }}
                onOpenRoute={toggleRoute}
                onClose={backToBoard}
            />
        ) : visiblePanel === "settings" ? (
            <SettingsPanel
                walk={walk}
                onWalkChange={(checked) => updateUrl({ walk: checked ? null : "0" })}
                notifications={<LeaveAlertSwitch />}
                savedRoutes={<SavedRoutesRow count={savedRoutes.length} onOpen={openSearch} />}
                account={loginEnabled ? <LogoutRow /> : undefined}
                onClose={backToBoard}
            />
        ) : (
            <BoardPanel
                fromId={fromId}
                toId={toId}
                board={currentBoard}
                status={status}
                offline={offline}
                now={now}
                autoOpened={autoOpened}
                onOpenSearch={openSearch}
                onOpenRoute={toggleRoute}
                onShowRoute={showRoute}
            />
        )

    return (
        <div className="lg:flex lg:h-dvh">
            <Sheet
                snap={snap}
                onSnapChange={setSnap}
                peek={boardMatches || visiblePanel !== "board" ? 0.46 : 0.34}
                label={PANEL_LABEL[visiblePanel]}
                visible={!stopSheetOpen}
                header={
                    <DesktopHeader
                        from={from}
                        to={to}
                        showSavedRoutes={visiblePanel === "board"}
                        onOpenSearch={openSearch}
                        onSwap={swap}
                        onClear={clearRoute}
                        onOpenRoute={toggleRoute}
                    />
                }
            >
                {content}
            </Sheet>

            <div className="fixed inset-0 lg:relative lg:inset-auto lg:min-w-0 lg:flex-1">
                <NetworkMap
                    fromId={fromId}
                    toId={toId}
                    walk={walk}
                    onPick={pick}
                    walkLegs={trip.walkLegs}
                    advisedLine={advised ? { line: advised.line, mode: advised.mode } : null}
                    pickTarget={pickTarget}
                    lineSearchOpen={lineSearchOpen}
                    onStopSheetChange={setStopSheetOpen}
                />
                <MapControls
                    from={from}
                    to={to}
                    settingsOpen={visiblePanel === "settings"}
                    lineSearchOpen={lineSearchOpen}
                    picking={pickTarget !== null}
                    onOpenSearch={openSearch}
                    onSwap={swap}
                    onClear={clearRoute}
                    onOpenSettings={() => open("settings", "full")}
                    onLocate={locate}
                    onToggleLineSearch={() => setLineSearchOpen((shown) => !shown)}
                    onStopPicking={() => {
                        setPickTarget(null)
                        openSearch()
                    }}
                />
            </div>
        </div>
    )
}
