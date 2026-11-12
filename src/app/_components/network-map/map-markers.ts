// Leaflet markers for the origin, the destination and the poles of an open stop

import L from "leaflet"

import type { StopPole } from "@/features/board/board.types"

// --- CONSTANTS ---

/** A pole's letter on the map: the blue dot of the stop card ("Paal" in the design). */
const POLE_STYLE =
    "display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 4px;border-radius:9999px;background:#1f5bd8;color:white;font:700 12px/16px var(--font-sans);flex-shrink:0"

const PIN_MASK = "url(/icons/pin.svg) center / 100% 100% no-repeat"

// --- HELPERS ---

export function poleMarker(pole: StopPole): L.Marker {
    const icon = L.divIcon({
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: `<span style="${POLE_STYLE};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)">${pole.label.replace(/[^\w-]/g, "")}</span>`,
    })
    return L.marker([pole.lat, pole.lon], { icon, interactive: false, keyboard: false })
}

/** Where you leave from: a blue dot with a white ring ("Van" in the design). */
export function originIcon(): L.DivIcon {
    return L.divIcon({
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        html: '<div style="width:24px;height:24px;border-radius:9999px;background:#2f6fed;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
    })
}

/** Where you are going: the red pin ("Naar"), drawn with the design's pin icon. */
export function destinationIcon(): L.DivIcon {
    return L.divIcon({
        className: "",
        iconSize: [38, 38],
        iconAnchor: [19, 34],
        html: `<div style="position:relative;width:38px;height:38px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><div style="position:absolute;inset:12.5% 20.83%"><div style="position:absolute;inset:-5.56% -7.14%;background:#e5484d;mask:${PIN_MASK};-webkit-mask:${PIN_MASK}"></div></div></div>`,
    })
}
