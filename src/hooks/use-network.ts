// The line network (/api/network), fetched once and shared by the map and the line badges

import { useEffect, useSyncExternalStore } from "react"

import { z } from "zod"

import type { Mode } from "@/features/board/board.types"
import type { LatLon, Network } from "@/features/network/network.service"

// --- CONSTANTS ---

/** Fallback colour per mode, for lines the feed gives no colour. */
export const MODE_COLOR: Record<Mode, string> = {
    tram: "#d97706",
    bus: "#0d9488",
    metro: "#0284c7",
    train: "#4f46e5",
    ferry: "#57534e",
    other: "#57534e",
}

const ModeSchema = z.enum(["tram", "bus", "metro", "train", "ferry", "other"])

/** Paths hold every coordinate of the network; checking each point would cost more than it guards. */
const NetworkSchema = z.object({
    shaped: z.boolean(),
    lines: z.array(
        z.object({
            id: z.string(),
            line: z.string(),
            name: z.string(),
            mode: ModeSchema,
            color: z.string().nullable(),
            paths: z.custom<LatLon[][]>((value) => Array.isArray(value)),
        }),
    ),
    stops: z.array(
        z.object({
            id: z.string(),
            areaIds: z.array(z.string()),
            name: z.string(),
            lat: z.number(),
            lon: z.number(),
            lines: z.array(z.number()),
        }),
    ),
}) satisfies z.ZodType<Network>

// --- INTERFACES ---

type State = { network: Network | null; failed: boolean; colors: Map<string, string> }

// --- HELPERS ---

const EMPTY: State = { network: null, failed: false, colors: new Map() }
let state: State = EMPTY
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

const colorKey = (line: string, mode: Mode) => `${mode}|${line}`

function set(next: State) {
    state = next
    for (const listener of listeners) listener()
}

function load(): Promise<void> {
    loading ??= fetch("/api/network")
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
        .then((body: unknown) => {
            const network = NetworkSchema.parse(body)
            const colors = new Map<string, string>()
            for (const line of network.lines) {
                if (line.color && !colors.has(colorKey(line.line, line.mode)))
                    colors.set(colorKey(line.line, line.mode), line.color)
            }
            set({ network, failed: false, colors })
        })
        .catch(() => {
            loading = null
            set({ ...state, failed: true })
        })
    return loading
}

const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

/** Black or white, whichever reads better on a "#rrggbb" background (yellow lines need black). */
export function textOn(background: string): string {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background)
    if (!match) return "#ffffff"
    const [r, g, b] = match.slice(1).map((hex) => parseInt(hex, 16) / 255) as [
        number,
        number,
        number,
    ]
    return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? "#111418" : "#ffffff"
}

export function useNetwork(): State {
    const current = useSyncExternalStore(
        subscribe,
        () => state,
        () => EMPTY,
    )
    useEffect(() => void load(), [])
    return current
}

/** A line's own colour (the operator's), or its mode's colour until the network is in. */
export function useLineColor(line: string, mode: Mode): string {
    const { colors } = useNetwork()
    return colors.get(colorKey(line, mode)) ?? MODE_COLOR[mode]
}
