// Wide-screen header of the side panel: app name, search bar and saved routes

import SavedRouteList from "@/app/_components/saved-routes/saved-route-list"
import type { SavedRoute } from "@/features/saved-routes/saved-routes"

import SearchBar from "./search-bar"
import { type StopOption } from "./stop-picker"

// --- INTERFACES ---

interface DesktopHeaderProps {
    from: StopOption | null
    to: StopOption | null
    /** The saved routes show here only next to the board. */
    showSavedRoutes: boolean
    onOpenSearch: () => void
    onSwap: () => void
    onClear: () => void
    onOpenRoute: (route: SavedRoute) => void
}

// --- COMPONENT ---

export default function DesktopHeader({
    from,
    to,
    showSavedRoutes,
    onOpenSearch,
    onSwap,
    onClear,
    onOpenRoute,
}: DesktopHeaderProps) {
    return (
        <div className="flex flex-col gap-3.5 px-6 pt-6 pb-3.5">
            <p className="text-heading-l flex items-center gap-2.5">
                <span
                    aria-hidden="true"
                    className="bg-dark text-on-dark flex size-9 items-center justify-center rounded-[9px]"
                >
                    B
                </span>
                Busbord
            </p>
            <SearchBar
                from={from}
                to={to}
                onOpen={onOpenSearch}
                onSwap={onSwap}
                onClear={onClear}
            />
            {showSavedRoutes && (
                <SavedRouteList
                    fromId={from?.id ?? null}
                    toId={to?.id ?? null}
                    onOpen={onOpenRoute}
                />
            )}
        </div>
    )
}
