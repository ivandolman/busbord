// Creates the Leaflet map with its background tiles, the point-on-map popup and resize handling

"use client"

import { useCallback, useEffect, useEffectEvent, useState } from "react"

import L from "leaflet"

import type { StopOption } from "@/app/_components/stop-picker"
import type { Settings } from "@/hooks/use-settings"
import { pointId } from "@/lib/place"

import type { PlaceKey } from "./network-map.types"
import { popupContent } from "./popup-content"

// --- CONSTANTS ---

/** Dutch government base map in grey: streets and buildings, no shops or churches. Covers NL only. */
const CALM_TILES =
    "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png"
const CALM_ATTRIBUTION = 'Kaart: <a href="https://www.pdok.nl">PDOK</a> / Kadaster'
const DETAILED_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers'

/**
 * Fired on the map when a hidden map (mobile, behind the "Kaart" button) becomes visible: a view
 * fitted while it measured 0x0 is nonsense and has to be fitted again.
 */
export const MAP_REVEAL_EVENT = "reveal"

// --- INTERFACES ---

interface UseLeafletMapOptions {
    mapStyle: Settings["mapStyle"]
    /** Set while the user is choosing a place on the map: the next tap picks it directly. */
    pickTarget: PlaceKey | null
    onPick: (key: PlaceKey, place: StopOption) => void
}

interface MapInstance {
    map: L.Map
    bases: Record<Settings["mapStyle"], L.TileLayer>
}

// --- HOOK ---

export function useLeafletMap({ mapStyle, pickTarget, onPick }: UseLeafletMapOptions) {
    const [instance, setInstance] = useState<MapInstance | null>(null)
    const map = instance?.map ?? null

    const containerRef = useCallback((element: HTMLDivElement | null) => {
        if (!element) return
        // One canvas for every vector layer. With a second canvas (Leaflet's default one, which the
        // walking-radius circle would land on) the top canvas swallows every click on the lines below.
        const created = L.map(element, {
            renderer: L.canvas({ tolerance: 6 }),
            // No zoom buttons, as in the design: pinch, scroll wheel or double click.
            zoomControl: false,
            attributionControl: true,
        })
        // Two backgrounds, neither needs a key: the quiet PDOK map (default) and standard
        // OpenStreetMap (fine for light use, see the OSM tile usage policy).
        const bases: MapInstance["bases"] = {
            calm: L.tileLayer(CALM_TILES, {
                attribution: CALM_ATTRIBUTION,
                maxZoom: 19,
                className: "network-tiles",
            }),
            detailed: L.tileLayer(DETAILED_TILES, {
                attribution: TILE_ATTRIBUTION,
                maxZoom: 19,
                className: "network-tiles",
            }),
        }
        created.setView([52.09, 5.12], 12)

        let wasHidden = element.clientWidth === 0
        const resize = new ResizeObserver(([entry]) => {
            created.invalidateSize()
            const hidden = !entry || entry.contentRect.width === 0
            if (wasHidden && !hidden) created.fire(MAP_REVEAL_EVENT)
            wasHidden = hidden
        })
        resize.observe(element)
        setInstance({ map: created, bases })
        return () => {
            resize.disconnect()
            created.remove()
            setInstance(null)
        }
    }, [])

    // The background is picked in "Kaart & instellingen" (a stored setting); it arrives after the
    // map is made, or changes in another tab: switch to it.
    useEffect(() => {
        if (!instance) return
        const { map: current, bases } = instance
        const wanted = bases[mapStyle]
        if (current.hasLayer(wanted)) return
        for (const layer of Object.values(bases)) if (layer !== wanted) current.removeLayer(layer)
        wanted.addTo(current)
        wanted.bringToBack()
    }, [instance, mapStyle])

    // Popups are built once per click; they read the latest props through effect events.
    const currentPickTarget = useEffectEvent(() => pickTarget)
    const pick = useEffectEvent((key: PlaceKey, place: StopOption) => onPick(key, place))

    useEffect(() => {
        if (!map) return
        const onClick = (event: L.LeafletMouseEvent) => {
            // A tap on a button in the stop card closes the card before the click reaches the
            // map: the button is gone from the page, so Leaflet no longer sees it was in a popup.
            const clicked = event.originalEvent.target
            if (clicked instanceof Node && !clicked.isConnected) return
            const id = pointId({ lat: event.latlng.lat, lon: event.latlng.lng })
            const place = { id, name: "Punt op de kaart" }
            const target = currentPickTarget()
            if (target) {
                pick(target, place)
                return
            }
            const content = popupContent({
                title: "Punt op de kaart",
                detail: "Haltes rond dit punt",
                badge: "pin",
                actions: [
                    {
                        label: "Van hier",
                        icon: "locate",
                        onClick: () => (pick("from", place), map.closePopup()),
                    },
                    {
                        label: "Naar hier",
                        icon: "pin",
                        onClick: () => (pick("to", place), map.closePopup()),
                    },
                ],
                onClose: () => map.closePopup(),
            })
            L.popup({ className: "card-popup", offset: [0, -4] })
                .setLatLng(event.latlng)
                .setContent(content)
                .openOn(map)
        }
        map.on("click", onClick)
        return () => {
            map.off("click", onClick)
        }
    }, [map])

    return { map, containerRef }
}
