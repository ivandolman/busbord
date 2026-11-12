// The departure opened step by step from the board, with its walks for the map

import { useState } from "react"

import type { WalkLeg } from "@/app/_components/network-map/network-map.types"
import type { Board, Departure } from "@/features/board/board.types"

// --- CONSTANTS ---

const NO_WALK_LEGS: WalkLeg[] = []

// --- INTERFACES ---

interface ShownTrip {
    departure: Departure
    walkLegs: WalkLeg[]
}

// --- HELPERS ---

/** The walks to and from a departure, to draw on the map. */
function walkLegsOf(board: Board, departure: Departure): WalkLeg[] {
    const legs: WalkLeg[] = []
    if (departure.walkToSeconds > 0) {
        legs.push({
            kind: "to",
            from: [board.origin.lat, board.origin.lon],
            to: [departure.from.lat, departure.from.lon],
            label: departure.from.platform || departure.from.name,
        })
    }
    if (departure.walkFromSeconds > 0) {
        legs.push({
            kind: "from",
            from: [departure.to.lat, departure.to.lon],
            to: [board.destination.lat, board.destination.lon],
            label: departure.to.name,
        })
    }
    return legs
}

/**
 * `board` is the latest board for the route on screen (null when there is none): the shown ride
 * takes its times from there. A new route drops the ride, which was for the old one.
 */
export function useShownTrip(fromId: string | null, toId: string | null, board: Board | null) {
    const [trip, setTrip] = useState<ShownTrip | null>(null)

    const routeKey = `${fromId}|${toId}`
    const [tripRouteKey, setTripRouteKey] = useState(routeKey)
    if (tripRouteKey !== routeKey) {
        setTripRouteKey(routeKey)
        setTrip(null)
    }

    /** `from` is the board the departure was picked on. Returns whether a ride is shown. */
    const show = (departure: Departure, from: Board | null): boolean => {
        if (!from) return false
        setTrip({ departure, walkLegs: walkLegsOf(from, departure) })
        return true
    }

    const live =
        trip && board
            ? (board.departures.find(
                  (departure) =>
                      departure.tripId === trip.departure.tripId &&
                      departure.plannedDeparture === trip.departure.plannedDeparture,
              ) ?? trip.departure)
            : null

    return {
        shown: trip !== null,
        /** The ride with the times of the latest refresh. */
        departure: live,
        walkLegs: trip?.walkLegs ?? NO_WALK_LEGS,
        show,
        clear: () => setTrip(null),
    }
}
