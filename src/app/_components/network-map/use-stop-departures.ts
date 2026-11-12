// The open stop's departures, refreshed like the board, its popup and its poles on the map

"use client"

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"

import L from "leaflet"

import { VISIBLE } from "@/components/ui/sheet"
import type { StopBoard } from "@/features/board/board.types"

import { fetchParsed } from "./fetch-parsed"
import { poleMarker } from "./map-markers"
import { StopBoardSchema } from "./network-map.schema"
import type { OpenStop } from "./network-map.types"
import { defaultDirection } from "./stop-directions"

// --- CONSTANTS ---

const STOP_REFRESH_MS = 30_000

/** The card scrolls inside itself, so a busy stop never pushes the map away. */
const POPUP_HOST_CLASS =
    "max-h-[min(640px,calc(100dvh-120px))] w-[400px] overflow-y-auto overscroll-contain p-5"

// --- INTERFACES ---

interface UseStopDeparturesOptions {
    map: L.Map | null
    openStop: OpenStop | null
    /** The popup of the stop with this key was closed on the map. */
    onDismiss: (key: number) => void
    /** A closed stop whose card is still on screen (its sheet sliding away); keeps its times. */
    lingerKey?: number | null
    fromId: string | null
    toId: string | null
    walk: boolean
    walkQuery: string | null
}

/** What the card shows, for the open stop with `key`. */
interface CardState {
    key: number
    board: StopBoard | null
    failed: boolean
    /** Direction picked in the card; undefined until the first load picks the default. */
    direction: string | null | undefined
    /** Epoch seconds the waits are counted from: when the board arrived or the card changed. */
    now: number
}

// --- HOOK ---

export function useStopDepartures({
    map,
    openStop,
    onDismiss,
    lingerKey = null,
    fromId,
    toId,
    walk,
    walkQuery,
}: UseStopDeparturesOptions) {
    const [card, setCard] = useState<CardState | null>(null)
    const popupRef = useRef<L.Popup | null>(null)

    /** The popup's content element, for the card to render into (wide screens). */
    const popupHost = useMemo(() => {
        if (!openStop || openStop.phone) return null
        const host = document.createElement("div")
        host.className = POPUP_HOST_CLASS
        return host
    }, [openStop])

    // walkQuery and the selection are read when the card opens, like the old popup did.
    const readSelection = useEffectEvent(() => ({ fromId, toId, walk, walkQuery }))
    const dismiss = useEffectEvent((key: number) => onDismiss(key))

    useEffect(() => {
        if (!map || !openStop) return
        const { stop, key } = openStop
        let popup: L.Popup | null = null
        if (openStop.phone || !popupHost) {
            map.closePopup()
            panAboveSheet(map, openStop.latlng)
        } else {
            popup = L.popup({
                offset: [0, -4],
                maxWidth: 400,
                minWidth: 400,
                className: "card-popup",
                autoPanPaddingTopLeft: [24, 80],
                autoPanPaddingBottomRight: [84, 24],
            })
                .setLatLng(openStop.latlng)
                .setContent(popupHost)
                .openOn(map)
            popup.on("remove", () => dismiss(key))
            popupRef.current = popup
        }

        const selection = readSelection()
        const query = new URLSearchParams(selection.walkQuery ?? "")
        query.set("stop", stop.id)
        query.set("walk", selection.walk ? "1" : "0")
        if (selection.toId && !stop.areaIds.includes(selection.toId))
            query.set("to", selection.toId)
        if (selection.fromId && !stop.areaIds.includes(selection.fromId)) {
            query.set("from", selection.fromId)
        }
        // The stop's poles, lettered as in the card, while it is open.
        const poleLayer = L.layerGroup().addTo(map)
        let controller: AbortController | null = null
        let first = true
        const load = () => {
            controller?.abort()
            controller = new AbortController()
            fetchParsed(`/api/departures?${query}`, StopBoardSchema, controller.signal)
                .then((board) => {
                    const direction = first ? defaultDirection(board) : undefined
                    const isFirst = first
                    first = false
                    const now = Math.floor(Date.now() / 1000)
                    setCard((current) => {
                        const base = cardFor(current, key)
                        return {
                            ...base,
                            board,
                            now,
                            direction: isFirst ? direction : base.direction,
                        }
                    })
                    poleLayer.clearLayers()
                    if (
                        board.poles.length > 1 ||
                        board.poles.some((pole) => pole.walkMeters !== null)
                    ) {
                        for (const pole of board.poles) poleMarker(pole).addTo(poleLayer)
                    }
                })
                .catch((error: unknown) => {
                    if (error instanceof DOMException && error.name === "AbortError") return
                    // A failed refresh keeps the last times on screen; only a failed first load says so.
                    if (first) setCard((current) => ({ ...cardFor(current, key), failed: true }))
                })
        }
        load()
        const timer = setInterval(load, STOP_REFRESH_MS)
        return () => {
            clearInterval(timer)
            controller?.abort()
            poleLayer.remove()
            if (popup) {
                popup.off("remove")
                map.closePopup(popup)
            }
            popupRef.current = null
        }
    }, [map, openStop, popupHost])

    const shownKey = openStop?.key ?? lingerKey
    const current = card && card.key === shownKey ? card : null
    const board = current?.board ?? null
    const direction = current?.direction

    // The popup grows with its content; let Leaflet re-measure and keep it in view.
    useEffect(() => {
        popupRef.current?.update()
    }, [board, direction, popupHost])

    const setDirection = (next: string | null) => {
        if (!openStop) return
        const { key } = openStop
        const now = Math.floor(Date.now() / 1000)
        setCard((previous) => ({ ...cardFor(previous, key), direction: next, now }))
    }

    return {
        board,
        failed: current?.failed ?? false,
        direction: direction ?? null,
        now: current?.now ?? 0,
        setDirection,
        popupHost,
    }
}

// --- HELPERS ---

/** Slides the map along with the stop's sheet, so the stop stays in sight above it. */
function panAboveSheet(map: L.Map, latlng: L.LatLng) {
    const style = getComputedStyle(document.documentElement)
    const top = parseFloat(style.getPropertyValue("--map-top")) || 0
    const screen = parseFloat(style.getPropertyValue("--app-h")) || window.innerHeight
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    map.panInside(latlng, {
        paddingTopLeft: [48, top + 48],
        paddingBottomRight: [48, screen * VISIBLE.peek + 48],
        animate: !reduced,
        duration: 0.42,
        easeLinearity: 0.2,
    })
}

/** The card state of the stop with `key`, fresh when the state belongs to another stop. */
function cardFor(current: CardState | null, key: number): CardState {
    if (current?.key === key) return current
    return { key, board: null, failed: false, direction: undefined, now: 0 }
}
