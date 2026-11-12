// "Van en naar": the two place fields, location and map shortcuts, and the saved routes

import SaveRouteButton from "@/app/_components/saved-routes/save-route-button"
import SavedRouteList from "@/app/_components/saved-routes/saved-route-list"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import type { SavedRoute } from "@/features/saved-routes/saved-routes"

import PanelHeader from "./panel-header"
import StopPicker, { type StopOption } from "./stop-picker"
import SwapButton from "./swap-button"

// --- INTERFACES ---

interface SearchPanelProps {
    from: StopOption | null
    to: StopOption | null
    walk: boolean
    locationFailed: boolean
    onChange: (key: "from" | "to", stop: StopOption | null) => void
    onSwap: () => void
    onLocate: () => void
    onChooseOnMap: () => void
    onOpenRoute: (route: SavedRoute) => void
    onClose: () => void
}

// --- COMPONENT ---

export default function SearchPanel({
    from,
    to,
    walk,
    locationFailed,
    onChange,
    onSwap,
    onLocate,
    onChooseOnMap,
    onOpenRoute,
    onClose,
}: SearchPanelProps) {
    return (
        <div className="flex flex-col gap-3">
            <PanelHeader title="Van en naar" onClose={onClose} />
            <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <StopPicker
                        label="Van"
                        placeholder="Utrecht CS of kies op de kaart"
                        value={from}
                        onChange={(stop) => onChange("from", stop)}
                    />
                    <StopPicker
                        label="Naar"
                        icon="pin"
                        placeholder="Heidelberglaan of kies op de kaart"
                        value={to}
                        onChange={(stop) => onChange("to", stop)}
                    />
                </div>
                <SwapButton onClick={onSwap} disabled={!from && !to} />
            </div>
            <div className="grid grid-cols-2 gap-2">
                {/* px-0: two buttons share the row, so the label gets every pixel. */}
                <Button onClick={onLocate} className="px-0">
                    <Icon name="locate" size={22} /> Mijn locatie
                </Button>
                <Button onClick={onChooseOnMap} className="px-0">
                    <Icon name="map" size={20} /> Kies op kaart
                </Button>
            </div>
            {locationFailed && <p className="text-body-s text-error">Locatie niet beschikbaar.</p>}
            <SavedRouteList fromId={from?.id ?? null} toId={to?.id ?? null} onOpen={onOpenRoute} />
            <SaveRouteButton from={from} to={to} walk={walk} />
        </div>
    )
}
