// "Pak deze": the one departure to take, with what comes after it

import LineBadge from "@/app/_components/line-badge"
import type { Board, Departure } from "@/features/board/board.types"
import { minutes, walkLine, whenPhrase } from "@/features/board/departure-text"
import { delayMinutes, formatClock, formatWait } from "@/features/board/format"
import { shortHeadsign } from "@/features/board/group"

import RouteButton, { type ShowRoute } from "./route-button"

// --- INTERFACES ---

interface PickCardProps {
    pick: Departure
    then: Departure[]
    board: Board
    now: number
    onShowRoute?: ShowRoute
}

// --- COMPONENT ---

export default function PickCard({ pick, then, board, now, onShowRoute }: PickCardProps) {
    const delay = delayMinutes(pick.plannedDeparture, pick.expectedDeparture)
    const walking = walkLine(pick, board.origin.name, board.destination.name)
    const mustWalk = pick.walkToSeconds > 0
    const leave = formatWait(mustWalk ? pick.leaveAt : pick.expectedDeparture, now)
    const busWait = formatWait(pick.expectedDeparture, now)
    const facts = [
        pick.from.platform ? `Perron ${pick.from.platform}` : null,
        mustWalk ? `bus ${busWait === "nu" ? "vertrekt nu" : `over ${busWait}`}` : null,
        `aan ${formatClock(pick.doorArrival)}${pick.walkFromSeconds > 0 ? " incl. lopen" : ""}`,
        pick.firstToArrive ? "eerste daar" : null,
    ]

    return (
        <div className="bg-dark text-on-dark flex flex-col items-start gap-2 rounded-2xl p-4">
            <p className="text-label-xs uppercase">Pak deze</p>
            <div className="flex items-center gap-3">
                <LineBadge line={pick.line} mode={pick.mode} size="lg" />
                <p className="text-heading-l min-w-0">
                    <span className="sr-only">richting </span>→{" "}
                    {pick.headsign ? shortHeadsign(pick.headsign, board.origin.name) : "?"}
                </p>
            </div>
            <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-figure-l tabular-nums">
                    {mustWalk ? "Ga lopen " : "Vertrekt "}
                    {whenPhrase(leave)}
                </span>
                {delay >= 1 && (
                    <span className="text-body-m text-warning-on-dark font-semibold">+{delay}</span>
                )}
            </p>
            <p className="text-body-s">{facts.filter(Boolean).join(" · ")}</p>
            {walking && <p className="text-body-s">{walking}</p>}
            <RouteButton departure={pick} onShowRoute={onShowRoute} variant="inverted" />
            {then.length > 0 && (
                <p className="border-on-dark/25 text-body-s flex w-full flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2.5">
                    <span>Daarna</span>
                    {then.map((next) => (
                        <span
                            key={`${next.tripId}-${next.plannedDeparture}`}
                            className="inline-flex items-center gap-2"
                        >
                            <LineBadge line={next.line} mode={next.mode} />
                            <span className="font-semibold">
                                {formatWait(next.expectedDeparture, now)}
                            </span>
                            {next.walkToSeconds > 0 && (
                                <span>(eerst {minutes(next.walkToSeconds)} min lopen)</span>
                            )}
                        </span>
                    ))}
                </p>
            )}
        </div>
    )
}
