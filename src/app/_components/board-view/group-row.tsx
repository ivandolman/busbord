// "Lijngroep": one line and direction with its next three times; opens to every ride

import { cva } from "class-variance-authority"

import LineBadge from "@/app/_components/line-badge"
import type { Board, Departure } from "@/features/board/board.types"
import { minutes, shortStop } from "@/features/board/departure-text"
import { delayMinutes, formatClock, formatWait, MODE_LABEL } from "@/features/board/format"
import { isUseful, type DepartureGroup } from "@/features/board/group"

import DepartureRow from "./departure-row"
import { type ShowRoute } from "./route-button"

// --- CONSTANTS ---

const MAX_TIMES = 3

// --- STYLING ---

const summaryTextVariants = cva("flex min-w-0 flex-1 flex-col gap-0.5", {
    variants: {
        /** No ride of this line is the best way there. */
        dimmed: {
            true: "opacity-60",
            false: "",
        },
    },
    defaultVariants: {
        dimmed: false,
    },
})

const timeChipVariants = cva("text-body-s flex gap-px rounded px-1.5 py-0.5 font-semibold", {
    variants: {
        state: {
            cancelled: "text-error line-through",
            useful: "bg-surface text-foreground",
            other: "text-muted",
        },
    },
    defaultVariants: {
        state: "other",
    },
})

// --- INTERFACES ---

interface GroupRowProps {
    group: DepartureGroup
    board: Board
    now: number
    onShowRoute?: ShowRoute
}

// --- HELPERS ---

/** Why a line without a best ride is further down. */
function slowReason(group: DepartureGroup): string | null {
    if (group.best) return null
    if (group.departures.every((departure) => departure.cancelled)) return "vervalt"
    const missed = group.departures.some(
        (departure) =>
            !departure.catchable && !departure.cancelled && departure.overtakenBy === null,
    )
    return missed ? "haal je niet meer" : "trager dan andere lijnen"
}

function chipTitle(departure: Departure): string | undefined {
    if (departure.cancelled) return "Rit vervalt"
    if (!departure.catchable) return "Haal je niet lopend"
    return departure.overtakenBy ? `Ingehaald door ${departure.overtakenBy}` : undefined
}

function chipState(departure: Departure): "cancelled" | "useful" | "other" {
    if (departure.cancelled) return "cancelled"
    return isUseful(departure) ? "useful" : "other"
}

// --- COMPONENT ---

export default function GroupRow({ group, board, now, onShowRoute }: GroupRowProps) {
    const lead = group.best ?? group.departures[0]
    if (!lead) return null
    const shown = group.departures.slice(0, MAX_TIMES)
    // "4 · 19 · 34 min" reads best; once a time is a clock time ("13:05") every chip says its own unit.
    const allMinutes = shown.every((departure) =>
        formatWait(departure.expectedDeparture, now).endsWith(" min"),
    )
    const meta = [
        lead.from.platform ? `perron ${lead.from.platform}` : null,
        lead.walkToSeconds > 0
            ? `${minutes(lead.walkToSeconds)} min lopen naar ${shortStop(lead.from.name, board.origin.name)}`
            : null,
        group.best ? `aan ${formatClock(group.best.doorArrival)}` : null,
    ].filter(Boolean)

    return (
        <li className="border-border border-t">
            <details className="group/row">
                <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-2.5 py-3 [&::-webkit-details-marker]:hidden">
                    <LineBadge line={group.line} mode={group.mode} />
                    <div className={summaryTextVariants({ dimmed: !group.best })}>
                        <p className="text-body-m line-clamp-2 font-semibold break-words">
                            → {group.direction || MODE_LABEL[group.mode]}
                        </p>
                        <p className="text-body-s text-muted line-clamp-2">
                            {[MODE_LABEL[group.mode], ...meta, slowReason(group)]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                    <p className="flex shrink-0 items-baseline gap-[3px] tabular-nums">
                        {shown.map((departure) => {
                            const delay = delayMinutes(
                                departure.plannedDeparture,
                                departure.expectedDeparture,
                            )
                            const wait = formatWait(departure.expectedDeparture, now)
                            return (
                                <span
                                    key={`${departure.tripId}-${departure.plannedDeparture}`}
                                    title={chipTitle(departure)}
                                    className={timeChipVariants({ state: chipState(departure) })}
                                >
                                    {allMinutes ? wait.replace(" min", "") : wait}
                                    {!departure.cancelled && delay >= 1 && (
                                        <span className="text-label-xs text-warning">+{delay}</span>
                                    )}
                                </span>
                            )
                        })}
                        {allMinutes && <span className="text-body-s text-muted">min</span>}
                    </p>
                    <span
                        aria-hidden="true"
                        className="text-heading-m text-muted transition-transform group-open/row:rotate-90"
                    >
                        ›
                    </span>
                </summary>
                <ul className="bg-surface/60 mb-2 rounded-xl">
                    {group.departures.map((departure) => (
                        <DepartureRow
                            key={`${departure.tripId}-${departure.plannedDeparture}`}
                            departure={departure}
                            originName={board.origin.name}
                            destinationName={board.destination.name}
                            now={now}
                            onShowRoute={onShowRoute}
                        />
                    ))}
                </ul>
            </details>
        </li>
    )
}
