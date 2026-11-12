// "Overstap-kaart": trips with one change, for when no direct ride helps

import LineBadge from "@/app/_components/line-badge"
import { Icon } from "@/components/ui/icon"
import type { Board, Transfer } from "@/features/board/board.types"
import { minutes, shortStop, whenPhrase } from "@/features/board/departure-text"
import { formatClock, formatWait } from "@/features/board/format"

// --- INTERFACES ---

interface TransferListProps {
    transfers: Transfer[]
    board: Board
    now: number
}

// --- HELPERS ---

/** "Over 4 min gaan lopen (6 min)" when there is a walk first, else "Vertrekt over 4 min". */
function startPhrase(journey: Transfer, now: number): string {
    const when = whenPhrase(formatWait(journey.leaveAt, now))
    if (journey.walkToSeconds > 0) {
        return `${when.charAt(0).toUpperCase()}${when.slice(1)} gaan lopen (${minutes(journey.walkToSeconds)} min)`
    }
    return `Vertrekt ${when}`
}

// --- COMPONENT ---

export default function TransferList({ transfers, board, now }: TransferListProps) {
    return (
        <section aria-label="Ritten met overstap" className="flex flex-col">
            <h2 className="text-body-s text-muted pt-1 pb-2 font-semibold">Met 1 overstap</h2>
            <ul>
                {transfers.map((journey) => {
                    const change = shortStop(journey.first.to.name, board.origin.name)
                    const wait = journey.second.expectedDeparture - journey.first.expectedArrival
                    return (
                        <li
                            key={`${journey.first.tripId}-${journey.second.tripId}`}
                            className="border-border flex flex-col gap-1 border-t py-3"
                        >
                            <div className="text-body-m flex flex-wrap items-center gap-x-2 gap-y-1">
                                <LineBadge line={journey.first.line} mode={journey.first.mode} />
                                <span className="font-semibold tabular-nums">
                                    {formatClock(journey.first.expectedDeparture)}
                                </span>
                                <Icon name="arrowR" size={16} className="text-muted" />
                                <span className="font-semibold">{change}</span>
                                <Icon name="arrowR" size={16} className="text-muted" />
                                <LineBadge line={journey.second.line} mode={journey.second.mode} />
                                <span className="font-semibold tabular-nums">
                                    {formatClock(journey.second.expectedDeparture)}
                                </span>
                            </div>
                            <p className="text-body-s text-muted">
                                {[
                                    startPhrase(journey, now),
                                    `${minutes(wait)} min overstappen${journey.changeWalkSeconds > 0 ? " (oversteken)" : ""}`,
                                    `aan ${formatClock(journey.doorArrival)}`,
                                ].join(" · ")}
                            </p>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
