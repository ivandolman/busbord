// Night lines: which of them you can still catch, so the map leaves out the ones not running

import type { TimetableRepository } from "@/features/board/board.repository"
import { localServiceDate, serviceDayStart, shiftServiceDate } from "@/lib/time"

// --- CONSTANTS ---

/** A night line shows while one of its trips is under way or leaves within this time. */
export const NIGHT_LINE_LEAD_SECONDS = 3600

// --- INTERFACES ---

export interface TripSpan {
    routeId: string
    /** Epoch seconds of the first departure and the last arrival. */
    start: number
    end: number
}

// --- HELPERS ---

/** Night lines are numbered "N" + digits (N2, N20), as the feed and the map's dashed strokes do. */
export function isNightLine(line: string): boolean {
    return /^N\d/i.test(line)
}

/** Route ids with a trip under way at `now` or leaving within `leadSeconds`. */
export function runningRoutes(spans: TripSpan[], now: number, leadSeconds: number): string[] {
    const routes = new Set<string>()
    for (const span of spans) {
        if (span.end >= now && span.start <= now + leadSeconds) routes.add(span.routeId)
    }
    return [...routes].sort()
}

// --- SERVICE ---

/**
 * Night lines running now or soon. Yesterday's service day is included: its trips run past
 * midnight (GTFS times beyond 24:00), which is when most night buses ride.
 */
export function runningNightLines(
    repository: Pick<TimetableRepository, "nightTripSpans">,
    nowMs: number,
    leadSeconds = NIGHT_LINE_LEAD_SECONDS,
): string[] {
    const today = localServiceDate(nowMs)
    const spans = [shiftServiceDate(today, -1), today].flatMap((date) => {
        const dayStart = serviceDayStart(date)
        return repository.nightTripSpans(date).map(({ routeId, start, end }) => ({
            routeId,
            start: dayStart + start,
            end: dayStart + end,
        }))
    })
    return runningRoutes(spans, Math.floor(nowMs / 1000), leadSeconds)
}
