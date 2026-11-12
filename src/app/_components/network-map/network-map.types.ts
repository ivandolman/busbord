// Shared types of the network map: picked places, departure walks, the open stop and drawn layers

import type L from "leaflet"

import type { NetworkLine, NetworkStop } from "@/features/network/network.service"

// --- INTERFACES ---

export type PlaceKey = "from" | "to"

/** A walk of one departure: to the stop where you get on, or from where you get off. */
export interface WalkLeg {
    kind: "to" | "from"
    from: [number, number]
    to: [number, number]
    /** The stop (or its platform) at the bus end of the walk. */
    label: string
}

/** A stop whose card is open. */
export interface OpenStop {
    stop: NetworkStop
    /** Line numbers the network knows at this stop. */
    served: string[]
    /** Why the stop does not help for the selection, if it does not. */
    note: string | null
    latlng: L.LatLng
    /** Opened as the phone's bottom sheet instead of a popup. */
    phone: boolean
    key: number
}

/** How a stop dot is drawn: a normal stop, one on the searched or reachable lines, or out of focus. */
export type StopLook = "normal" | "focus" | "faded"

export interface DrawnLine {
    line: NetworkLine
    layer: L.Polyline
}

export interface DrawnStop {
    stop: NetworkStop
    layer: L.CircleMarker
    look: StopLook
}

/** Every network layer on the map, shared by the hooks that restyle, label and hit-test them. */
export interface NetworkLayers {
    lines: DrawnLine[]
    /** With origin and destination: the ridden stretches drawn instead of whole lines. */
    segments: DrawnLine[]
    stops: DrawnStop[]
}
