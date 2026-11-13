// Polls which night lines run now or within the hour, so the map can leave the others out

"use client"

import { useEffect, useState } from "react"

import { fetchParsed } from "./fetch-parsed"
import { NightLinesSchema } from "./network-map.schema"

// --- CONSTANTS ---

const REFRESH_MS = 5 * 60_000

// --- HOOK ---

/** Route ids of running night lines; null until the first answer (or when it failed). */
export function useNightLines(): Set<string> | null {
    const [running, setRunning] = useState<Set<string> | null>(null)

    useEffect(() => {
        const controller = new AbortController()
        const load = () =>
            fetchParsed("/api/night-lines", NightLinesSchema, controller.signal)
                .then((next) => setRunning((current) => (sameSet(current, next) ? current : next)))
                .catch(() => undefined)
        void load()
        const timer = window.setInterval(() => void load(), REFRESH_MS)
        return () => {
            controller.abort()
            window.clearInterval(timer)
        }
    }, [])

    return running
}

// --- HELPERS ---

/** Keeps the same Set when nothing changed, so the map does not redraw every few minutes. */
function sameSet(a: Set<string> | null, b: Set<string>): boolean {
    return a !== null && a.size === b.size && [...b].every((id) => a.has(id))
}
