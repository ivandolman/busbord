// Notifies shortly before you must leave for the bus of a regular trip ("Vertrek nu")

import { useEffect, useEffectEvent } from "react"

import { z } from "zod"

import type { Board } from "@/features/board/board.types"
import { formatClock } from "@/features/board/format"
import { overview, shortHeadsign } from "@/features/board/group"
import { isScheduledAt, type SavedRoute } from "@/features/saved-routes/saved-routes"
import { LEAVE_ALERT_STORAGE_KEY, useLeaveAlertEnabled } from "@/hooks/use-leave-alert-enabled"

// --- CONSTANTS ---

/** How long before you have to set off the notification comes. */
const WARN_SECONDS = 2 * 60

/** The buses already warned about in this tab (sessionStorage, same key as the switch). */
const SentSchema = z.array(z.string()).catch([])

// --- HELPERS ---

function readSent(): Set<string> {
    try {
        return new Set(
            SentSchema.parse(JSON.parse(sessionStorage.getItem(LEAVE_ALERT_STORAGE_KEY) ?? "[]")),
        )
    } catch {
        return new Set()
    }
}

async function notify(title: string, body: string, url: string) {
    const options: NotificationOptions = {
        body,
        tag: "vertrek-nu",
        icon: "/icon.svg",
        data: { url },
    }
    const registration =
        "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (registration) await registration.showNotification(title, options)
    else new Notification(title, options)
}

/**
 * During a regular trip's time window, warns WARN_SECONDS before you must leave for the bus the
 * board tells you to take. Each bus once. Re-planned on every board refresh, so a delay moves it.
 */
export function useLeaveAlert(board: Board | null, route: SavedRoute | null, now: number) {
    const enabled = useLeaveAlertEnabled()
    const pick = board
        ? overview(board.departures, board.origin.name, undefined, board.walkTieSeconds).pick
        : null
    const active = Boolean(
        enabled && route?.schedule && isScheduledAt(route.schedule, new Date(now * 1000)),
    )
    // `pick` changes identity on every refresh; key and leaveAt say whether anything changed.
    const key = pick ? `${pick.tripId}|${pick.plannedDeparture}` : null
    const leaveAt = pick?.leaveAt ?? null
    const routeId = route?.id

    const fire = useEffectEvent((sent: Set<string>, sentKey: string) => {
        if (!pick || !route) return
        sent.add(sentKey)
        sessionStorage.setItem(LEAVE_ALERT_STORAGE_KEY, JSON.stringify([...sent].slice(-20)))
        const towards = pick.headsign ? shortHeadsign(pick.headsign, board?.origin.name ?? "") : ""
        const walk =
            pick.walkToSeconds > 0 ? ` Lopen: ${Math.round(pick.walkToSeconds / 60)} min.` : ""
        const platform = pick.from.platform ? `, perron ${pick.from.platform}` : ""
        const query = new URLSearchParams({ from: route.from.id, to: route.to.id })
        void notify(
            `Vertrek nu: ${route.name}`,
            `Lijn ${pick.line}${towards ? ` → ${towards}` : ""} vertrekt om ${formatClock(pick.expectedDeparture)}${platform}.${walk}`,
            `/?${query}`,
        )
    })

    useEffect(() => {
        if (
            !active ||
            !key ||
            leaveAt === null ||
            routeId === undefined ||
            Notification.permission !== "granted"
        )
            return
        const sent = readSent()
        if (sent.has(key)) return
        const delay = (leaveAt - WARN_SECONDS) * 1000 - Date.now()
        // Opened (or refreshed) inside the warning window: warn straight away, unless it is too late.
        if (delay <= 0) {
            if (Date.now() < leaveAt * 1000) fire(sent, key)
            return
        }
        const timer = setTimeout(() => fire(sent, key), delay)
        return () => clearTimeout(timer)
    }, [active, key, leaveAt, routeId])
}
