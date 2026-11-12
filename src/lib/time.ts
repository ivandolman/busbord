// Conversions between epoch time and GTFS service dates and times in the timetable's time zone

import { config } from "./config"

// --- CONSTANTS ---

const PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
})

// --- INTERFACES ---

interface LocalParts {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
}

// --- HELPERS ---

function localParts(epochMs: number): LocalParts {
    const parts: Record<string, number> = {}
    for (const part of PARTS_FORMATTER.formatToParts(new Date(epochMs))) {
        if (part.type !== "literal") parts[part.type] = Number(part.value)
    }
    return {
        year: parts.year ?? 0,
        month: parts.month ?? 1,
        day: parts.day ?? 1,
        hour: parts.hour ?? 0,
        minute: parts.minute ?? 0,
        second: parts.second ?? 0,
    }
}

function utcOffsetMs(epochMs: number): number {
    const p = localParts(epochMs)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    return asUtc - Math.floor(epochMs / 1000) * 1000
}

/** Local calendar date as YYYYMMDD, the format GTFS uses for service dates. */
export function localServiceDate(epochMs: number): string {
    const p = localParts(epochMs)
    return `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`
}

export function shiftServiceDate(date: string, days: number): string {
    const year = Number(date.slice(0, 4))
    const month = Number(date.slice(4, 6))
    const day = Number(date.slice(6, 8))
    const shifted = new Date(Date.UTC(year, month - 1, day + days, 12))
    return shifted.toISOString().slice(0, 10).replaceAll("-", "")
}

/**
 * Epoch seconds that GTFS time 00:00:00 refers to on a service date.
 * GTFS defines times relative to "noon minus 12 hours" rather than midnight, which keeps
 * timetables correct on the two days a year the clocks change.
 */
export function serviceDayStart(date: string): number {
    const year = Number(date.slice(0, 4))
    const month = Number(date.slice(4, 6))
    const day = Number(date.slice(6, 8))
    const noonGuess = Date.UTC(year, month - 1, day, 12)
    const localNoon = noonGuess - utcOffsetMs(noonGuess)
    return localNoon / 1000 - 12 * 3600
}

/** Parses a GTFS time such as "25:10:00" (hours may exceed 23) into seconds, or null when empty. */
export function parseGtfsTime(value: string): number | null {
    const match = /^\s*(\d{1,3}):(\d{2}):(\d{2})\s*$/.exec(value)
    if (!match) return null
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}
