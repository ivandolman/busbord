// The departure board for the chosen places, refreshed every 30 s and kept when offline

import { useEffect, useEffectEvent, useState } from "react"

import { z } from "zod"

import type { Board } from "@/features/board/board.types"

// --- CONSTANTS ---

const REFRESH_MS = 30_000
const CLOCK_TICK_MS = 10_000

const ErrorBodySchema = z.object({ error: z.string() })

// --- INTERFACES ---

export type BoardStatus =
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string }

/** "unreachable": no answer at all; shown as an error only while there is no older board to show. */
type RawStatus = BoardStatus | { status: "unreachable" }

interface UseBoardOptions {
    fromId: string | null
    toId: string | null
    walk: boolean
    /** Walking settings as query parameters (see walkParams). */
    walkQuery: string
    /** False until the settings are in; nothing is fetched before. */
    ready: boolean
    onBoard?: (board: Board) => void
}

// --- HELPERS ---

const IDLE: BoardStatus = { status: "idle" }
const nowSeconds = () => Math.floor(Date.now() / 1000)

export function useBoard({ fromId, toId, walk, walkQuery, ready, onBoard }: UseBoardOptions) {
    const [board, setBoard] = useState<Board | null>(null)
    const [rawStatus, setRawStatus] = useState<RawStatus>(IDLE)
    /** Set when the board shown is an older copy: no network, from the offline cache or memory. */
    const [offline, setOffline] = useState(false)
    const [now, setNow] = useState(nowSeconds)

    // A new request (or none) resets the status while rendering, before the fetch below starts.
    const requestKey =
        fromId && toId && ready ? JSON.stringify([fromId, toId, walk, walkQuery]) : null
    const [startedKey, setStartedKey] = useState<string | null | undefined>(undefined)
    if (startedKey !== requestKey) {
        setStartedKey(requestKey)
        if (requestKey === null) {
            if (ready) setBoard(null)
            setRawStatus(IDLE)
        } else {
            setRawStatus({ status: "loading" })
        }
    }

    const handleBoard = useEffectEvent((next: Board) => onBoard?.(next))

    useEffect(() => {
        const timer = setInterval(() => setNow(nowSeconds()), CLOCK_TICK_MS)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        if (!fromId || !toId || !ready) return
        let cancelled = false
        const controller = new AbortController()

        const load = async () => {
            try {
                const query = new URLSearchParams(walkQuery)
                query.set("from", fromId)
                query.set("to", toId)
                query.set("walk", walk ? "1" : "0")
                const response = await fetch(`/api/board?${query}`, { signal: controller.signal })
                const body: unknown = await response.json()
                if (cancelled) return
                setOffline(response.headers.get("X-Offline") === "1")
                const error = ErrorBodySchema.safeParse(body)
                if (!response.ok || error.success) {
                    setBoard(null)
                    setRawStatus({
                        status: "error",
                        message: error.success ? error.data.error : "Er ging iets mis.",
                    })
                    return
                }
                // The API's own type; there is no schema for the whole board (yet).
                const next = body as Board
                setBoard(next)
                handleBoard(next)
                setNow(nowSeconds())
                setRawStatus(IDLE)
            } catch {
                if (cancelled) return
                // Keep showing the last board (its times are absolute), marked as offline.
                setOffline(true)
                setRawStatus({ status: "unreachable" })
            }
        }

        void load()
        const timer = setInterval(() => void load(), REFRESH_MS)
        return () => {
            cancelled = true
            controller.abort()
            clearInterval(timer)
        }
    }, [fromId, toId, walk, walkQuery, ready])

    const status: BoardStatus =
        rawStatus.status !== "unreachable"
            ? rawStatus
            : board
              ? IDLE
              : { status: "error", message: "Geen verbinding. We proberen het zo opnieuw." }

    return { board, status, offline, now }
}
