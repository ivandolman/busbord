// One ride of an opened line on the board ("Rit-rij"), with its status

import { cva } from "class-variance-authority"

import LineBadge from "@/app/_components/line-badge"
import { RollingText } from "@/components/ui/rolling-text"
import type { Departure } from "@/features/board/board.types"
import { walkLine } from "@/features/board/departure-text"
import { delayMinutes, formatClock, formatWait, MODE_LABEL } from "@/features/board/format"
import { shortHeadsign } from "@/features/board/group"

import RouteButton, { type ShowRoute } from "./route-button"

// --- STYLING ---

const rowVariants = cva("border-border flex items-center gap-3 border-t p-3", {
    variants: {
        /** Can no longer be caught (but still runs). */
        unreachable: {
            true: "opacity-60",
            false: "",
        },
    },
    defaultVariants: {
        unreachable: false,
    },
})

const waitVariants = cva("text-body-m font-semibold", {
    variants: {
        cancelled: {
            true: "text-error line-through",
            false: "text-foreground",
        },
    },
    defaultVariants: {
        cancelled: false,
    },
})

const detailVariants = cva("text-body-s", {
    variants: {
        tone: {
            muted: "text-muted",
            warning: "text-warning",
            error: "text-error",
            inherit: "",
        },
    },
    defaultVariants: {
        tone: "muted",
    },
})

const arrivalVariants = cva("flex shrink-0 flex-col items-end gap-px", {
    variants: {
        muted: {
            true: "text-muted",
            false: "",
        },
    },
    defaultVariants: {
        muted: false,
    },
})

// --- INTERFACES ---

interface DepartureRowProps {
    departure: Departure
    originName: string
    destinationName: string
    now: number
    onShowRoute?: ShowRoute
}

// --- HELPERS ---

function leaveNote(departure: Departure, leaveIn: number): string {
    if (!departure.catchable) return " · te krap om te halen"
    return leaveIn <= 0 ? " · nu vertrekken" : ` · vertrek over ${leaveIn} min`
}

// --- COMPONENT ---

export default function DepartureRow({
    departure,
    originName,
    destinationName,
    now,
    onShowRoute,
}: DepartureRowProps) {
    const delay = delayMinutes(departure.plannedDeparture, departure.expectedDeparture)
    const overtaken = departure.overtakenBy !== null
    const where = [
        departure.from.platform ? `perron ${departure.from.platform}` : null,
        departure.headsign ? `naar ${shortHeadsign(departure.headsign, originName)}` : null,
    ].filter(Boolean)
    const walking = walkLine(departure, originName, destinationName)
    const leaveIn = Math.floor((departure.leaveAt - now) / 60)
    const muted = overtaken || !departure.catchable

    return (
        <li className={rowVariants({ unreachable: !departure.catchable && !departure.cancelled })}>
            <LineBadge line={departure.line} mode={departure.mode} />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <p className="flex items-baseline gap-1.5">
                    <span className={waitVariants({ cancelled: departure.cancelled })}>
                        <RollingText value={formatWait(departure.expectedDeparture, now)} />
                    </span>
                    {!departure.cancelled && delay >= 1 && (
                        <RollingText value={`+${delay}`} className="text-label-xs text-warning" />
                    )}
                </p>
                <p className={detailVariants({ tone: departure.cancelled ? "error" : "muted" })}>
                    {departure.cancelled
                        ? "Rit vervalt"
                        : [MODE_LABEL[departure.mode], ...where].join(" · ")}
                </p>
                {walking && !departure.cancelled && (
                    <p
                        className={detailVariants({
                            tone: departure.catchable ? "muted" : "warning",
                        })}
                    >
                        {walking}
                        {departure.walkToSeconds > 0 && leaveNote(departure, leaveIn)}
                    </p>
                )}
                {departure.catchable && (
                    <RouteButton departure={departure} onShowRoute={onShowRoute} />
                )}
            </div>
            <div className={arrivalVariants({ muted: muted || departure.cancelled })}>
                <p className="text-body-m font-semibold tabular-nums">
                    {departure.cancelled ? "–" : formatClock(departure.doorArrival)}
                </p>
                {departure.walkFromSeconds > 0 && !departure.cancelled && (
                    <p className={detailVariants({ tone: muted ? "inherit" : "muted" })}>
                        incl. lopen
                    </p>
                )}
                {departure.firstToArrive && <p className="text-body-s text-success">Eerste daar</p>}
                {overtaken && <p className="text-body-s">Ingehaald door {departure.overtakenBy}</p>}
            </div>
        </li>
    )
}
