// Opens the regular trip whose time window it is, when the app starts without a route

import { useEffect, useEffectEvent, useRef, useState } from "react"

import { scheduledRoute, type SavedRoute } from "@/features/saved-routes/saved-routes"
import { whenSavedRoutesLoaded } from "@/hooks/use-saved-routes"

// --- HELPERS ---

/**
 * Only once per visit, so clearing the fields afterwards is respected. Returns the route it
 * opened, if any.
 */
export function useScheduledRoute(
    fromId: string | null,
    toId: string | null,
    onOpen: (route: SavedRoute) => void,
) {
    const [opened, setOpened] = useState<SavedRoute | null>(null)
    const checked = useRef(false)
    const open = useEffectEvent(onOpen)

    useEffect(() => {
        let cancelled = false
        void whenSavedRoutesLoaded().then((routes) => {
            if (cancelled || checked.current) return
            checked.current = true
            if (fromId || toId) return
            const route = scheduledRoute(routes, new Date())
            if (route) {
                setOpened(route)
                open(route)
            }
        })
        return () => {
            cancelled = true
        }
    }, [fromId, toId])

    return opened
}
