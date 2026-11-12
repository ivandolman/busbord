// Floating controls over the map: search bar (phone), round buttons and "stop choosing"

import { Icon } from "@/components/ui/icon"

import MapButton from "./map-button"
import SearchBar from "./search-bar"
import { type StopOption } from "./stop-picker"

// --- INTERFACES ---

interface MapControlsProps {
    from: StopOption | null
    to: StopOption | null
    settingsOpen: boolean
    lineSearchOpen: boolean
    /** True while the next tap on the map picks a place. */
    picking: boolean
    onOpenSearch: () => void
    onSwap: () => void
    onOpenSettings: () => void
    onLocate: () => void
    onToggleLineSearch: () => void
    onStopPicking: () => void
}

// --- COMPONENT ---

export default function MapControls({
    from,
    to,
    settingsOpen,
    lineSearchOpen,
    picking,
    onOpenSearch,
    onSwap,
    onOpenSettings,
    onLocate,
    onToggleLineSearch,
    onStopPicking,
}: MapControlsProps) {
    return (
        <>
            <SearchBar
                from={from}
                to={to}
                onOpen={onOpenSearch}
                onSwap={onSwap}
                className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-[max(1rem,env(safe-area-inset-right))] left-[max(1rem,env(safe-area-inset-left))] z-[1050] lg:hidden"
            />
            <div className="absolute top-[calc(var(--map-top)+0.75rem)] right-[max(1rem,env(safe-area-inset-right))] z-[1050] flex flex-col gap-2.5 lg:top-6 lg:right-6">
                <MapButton
                    label="Kaart en instellingen"
                    onClick={onOpenSettings}
                    pressed={settingsOpen}
                >
                    <Icon name="layers" size={22} />
                </MapButton>
                <MapButton label="Mijn locatie als vertrekpunt" onClick={onLocate}>
                    <Icon name="locate" size={22} />
                </MapButton>
                <MapButton
                    label="Lijn zoeken"
                    onClick={onToggleLineSearch}
                    pressed={lineSearchOpen}
                    className="lg:hidden"
                >
                    <Icon name="route" size={22} />
                </MapButton>
            </div>
            {picking && (
                <button
                    type="button"
                    onClick={onStopPicking}
                    className="bg-dark text-body-s text-on-dark absolute top-[calc(var(--map-top)+0.75rem)] left-[max(1rem,env(safe-area-inset-left))] z-[1050] h-11 rounded-full px-4 font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.16)] lg:top-6 lg:left-1/2 lg:-translate-x-1/2"
                >
                    Kiezen op kaart stoppen
                </button>
            )}
        </>
    )
}
