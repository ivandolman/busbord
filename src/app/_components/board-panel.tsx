// The sheet's board panel: what to choose next, status messages and the departure board

import BoardView from "@/app/_components/board-view/board-view"
import type { ShowRoute } from "@/app/_components/board-view/route-button"
import SavedRouteList from "@/app/_components/saved-routes/saved-route-list"
import { Icon } from "@/components/ui/icon"
import { SkeletonRows } from "@/components/ui/skeleton-rows"
import type { Board } from "@/features/board/board.types"
import { withoutPast } from "@/features/board/build-board"
import { formatClock } from "@/features/board/format"
import { sameRoute, scheduleLabel, type SavedRoute } from "@/features/saved-routes/saved-routes"
import type { BoardStatus } from "@/hooks/use-board"

// --- INTERFACES ---

interface BoardPanelProps {
    fromId: string | null
    toId: string | null
    /** The board for the chosen places, or null while there is none (yet). */
    board: Board | null
    status: BoardStatus
    offline: boolean
    now: number
    /** The regular trip opened on start, if any. */
    autoOpened: SavedRoute | null
    onOpenSearch: () => void
    onOpenRoute: (route: SavedRoute) => void
    onShowRoute: ShowRoute
}

// --- COMPONENT ---

export default function BoardPanel({
    fromId,
    toId,
    board,
    status,
    offline,
    now,
    autoOpened,
    onOpenSearch,
    onOpenRoute,
    onShowRoute,
}: BoardPanelProps) {
    const showBoard = board !== null && status.status !== "error"
    return (
        <div aria-live="polite" className="flex flex-col gap-3.5">
            {!fromId && !toId && (
                <>
                    <button
                        type="button"
                        onClick={onOpenSearch}
                        className="bg-surface text-body-m flex h-14 w-full items-center gap-2.5 rounded-full px-4 text-left font-semibold lg:hidden"
                    >
                        <Icon name="search" size={20} /> Waar wil je heen?
                    </button>
                    <div className="lg:hidden">
                        <SavedRouteList fromId={fromId} toId={toId} onOpen={onOpenRoute} />
                    </div>
                    <p className="text-body-s text-muted">
                        Tik op de kaart op een halte of een willekeurige plek. Na een vertrekpunt
                        kleuren de haltes groen waar je zonder overstap komt.
                    </p>
                </>
            )}
            {(fromId || toId) && !(fromId && toId) && (
                <p className="text-body-s text-muted">
                    {fromId ? "Kies nog waar je heen wilt" : "Kies nog waar je vandaan gaat"}: zoek
                    bovenin, of tik op een halte of plek op de kaart.
                </p>
            )}
            {autoOpened?.schedule && sameRoute(autoOpened, fromId, toId) && (
                <p className="bg-surface text-body-s rounded-xl px-3 py-2">
                    Vaste reis “{autoOpened.name}” ({scheduleLabel(autoOpened.schedule)}) staat
                    klaar.
                </p>
            )}
            {status.status === "error" && (
                <p className="border-error/30 bg-error/5 text-body-s text-error rounded-[14px] border p-4">
                    {status.message}
                </p>
            )}
            {status.status === "loading" && !board && (
                <SkeletonRows label="Vertrektijden ophalen…" withCard />
            )}
            {showBoard && offline && (
                <p className="bg-surface text-body-s flex items-start gap-2 rounded-[14px] p-3">
                    <Icon name="offline" size={18} className="mt-px" />
                    <span>
                        Offline · tijden van {formatClock(board.generatedAt)}, volgens de
                        dienstregeling van toen. Vertraging na dat moment zie je niet.
                    </span>
                </p>
            )}
            {showBoard && (
                <BoardView
                    board={offline ? withoutPast(board, now) : board}
                    now={now}
                    onShowRoute={onShowRoute}
                />
            )}
        </div>
    )
}
