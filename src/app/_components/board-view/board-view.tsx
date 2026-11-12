// The departure board: what to take, notices, transfers and every line to the destination

import LineBadge from "@/app/_components/line-badge"
import { Icon } from "@/components/ui/icon"
import type { Board } from "@/features/board/board.types"
import { formatClock } from "@/features/board/format"
import { overview } from "@/features/board/group"

import AlertList from "./alert-list"
import GroupRow from "./group-row"
import PickCard from "./pick-card"
import { type ShowRoute } from "./route-button"
import TransferList from "./transfer-list"

// --- CONSTANTS ---

const REALTIME_NOTE: Record<Board["realtime"], string> = {
    live: "Met actuele tijden",
    unavailable: "Actuele tijden zijn nu niet beschikbaar. Je ziet de dienstregeling.",
    disabled: "Volgens de dienstregeling, zonder actuele tijden",
}

// --- INTERFACES ---

interface BoardViewProps {
    board: Board
    now: number
    onShowRoute?: ShowRoute
}

// --- COMPONENT ---

export default function BoardView({ board, now, onShowRoute }: BoardViewProps) {
    if (board.departures.length === 0) {
        return (
            <div className="flex flex-col gap-3.5">
                <AlertList alerts={board.alerts} />
                {board.transfers.length > 0 ? (
                    <TransferList transfers={board.transfers} board={board} now={now} />
                ) : (
                    <div className="bg-surface rounded-2xl p-4">
                        <p className="text-body-m font-semibold">
                            Geen rit in de komende 90 minuten
                        </p>
                        <p className="text-body-s text-muted mt-1">
                            {board.walkIncluded
                                ? "Ook met één overstap is er nu niets gevonden."
                                : "Zet haltes op loopafstand aan, of kies een halte in de buurt."}
                        </p>
                    </div>
                )}
            </div>
        )
    }

    const { pick, then, groups } = overview(board.departures, board.origin.name)
    const useful = groups.filter((group) => group.best)
    const slower = groups.filter((group) => !group.best)

    return (
        <section
            aria-label={`Vertrekken van ${board.origin.name} naar ${board.destination.name}`}
            className="flex flex-col gap-3.5"
        >
            {pick ? (
                <PickCard
                    pick={pick}
                    then={then}
                    board={board}
                    now={now}
                    onShowRoute={onShowRoute}
                />
            ) : (
                <p className="border-warning-border bg-warning-bg text-body-s text-warning rounded-[14px] border p-4">
                    Geen rit meer die je nu nog haalt. Hieronder staan de latere vertrekken.
                </p>
            )}
            <AlertList alerts={board.alerts} />
            {board.transfers.length > 0 && (
                <TransferList transfers={board.transfers} board={board} now={now} />
            )}
            <div className="flex flex-col">
                <div className="text-body-s text-muted flex items-center justify-between pt-1 pb-2">
                    <h2 className="font-semibold">Alle lijnen hierheen</h2>
                    {board.summary.headwayMinutes !== null && (
                        <span>samen elke ~{board.summary.headwayMinutes} min</span>
                    )}
                </div>
                <ul>
                    {useful.map((group) => (
                        <GroupRow
                            key={group.key}
                            group={group}
                            board={board}
                            now={now}
                            onShowRoute={onShowRoute}
                        />
                    ))}
                </ul>
                {slower.length > 0 && (
                    <details className="group/slow">
                        <summary className="border-border flex h-12 cursor-pointer list-none items-center gap-2 border-t [&::-webkit-details-marker]:hidden">
                            <span className="text-body-m text-muted font-semibold">
                                Toon {slower.length}{" "}
                                {slower.length === 1 ? "tragere lijn" : "tragere lijnen"}
                            </span>
                            {slower.slice(0, 4).map((group) => (
                                <LineBadge key={group.key} line={group.line} mode={group.mode} />
                            ))}
                            <Icon
                                name="chevD"
                                size={20}
                                className="text-muted ml-auto transition-transform group-open/slow:rotate-180"
                            />
                        </summary>
                        <ul>
                            {slower.map((group) => (
                                <GroupRow
                                    key={group.key}
                                    group={group}
                                    board={board}
                                    now={now}
                                    onShowRoute={onShowRoute}
                                />
                            ))}
                        </ul>
                    </details>
                )}
                <p className="border-border text-body-s text-muted border-t pt-2.5">
                    Tik op een lijn voor alle ritten · {REALTIME_NOTE[board.realtime]} · bijgewerkt{" "}
                    {formatClock(board.generatedAt)}
                </p>
            </div>
        </section>
    )
}
