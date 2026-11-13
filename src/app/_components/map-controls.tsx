// Floating controls over the map: search bar (phone), round buttons and "stop choosing"

"use client"

import { useLayoutEffect, useRef, useState } from "react"

import { Icon } from "@/components/ui/icon"
import { useSheetMetrics } from "@/hooks/use-sheet-metrics"

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
    onClear: () => void
    onOpenSettings: () => void
    onLocate: () => void
    onToggleLineSearch: () => void
    onStopPicking: () => void
}

// --- CONSTANTS ---

/** Room kept between a button and the top of the sheet. */
const CLEARANCE_PX = 12

// --- HELPERS ---

/**
 * Which of the column's buttons a bottom sheet covers. From layout offsets, not the buttons'
 * boxes, so the fade-out scale does not change the answer.
 */
function useCoveredButtons(count: number) {
    const column = useRef<HTMLDivElement>(null)
    const { covered, screen } = useSheetMetrics()
    const [hidden, setHidden] = useState<boolean[]>(() => Array(count).fill(false))

    useLayoutEffect(() => {
        const element = column.current
        if (!element) return
        const limit = screen - covered - CLEARANCE_PX
        const top = element.getBoundingClientRect().top
        const next = [...element.children].map((child) => {
            if (screen === 0 || !(child instanceof HTMLElement) || child.offsetHeight === 0)
                return false
            return top + child.offsetTop + child.offsetHeight > limit
        })
        setHidden((previous) =>
            previous.length === next.length && previous.every((value, i) => value === next[i])
                ? previous
                : next,
        )
    }, [covered, screen])

    return { column, hidden }
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
    onClear,
    onOpenSettings,
    onLocate,
    onToggleLineSearch,
    onStopPicking,
}: MapControlsProps) {
    const { column, hidden } = useCoveredButtons(3)
    return (
        <>
            <SearchBar
                from={from}
                to={to}
                onOpen={onOpenSearch}
                onSwap={onSwap}
                onClear={onClear}
                className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-[max(1rem,env(safe-area-inset-right))] left-[max(1rem,env(safe-area-inset-left))] z-[1050] lg:hidden"
            />
            <div
                ref={column}
                className="absolute top-[calc(var(--map-top)+0.75rem)] right-[max(1rem,env(safe-area-inset-right))] z-[1050] flex flex-col gap-2.5 lg:top-6 lg:right-6"
            >
                <MapButton
                    label="Kaart en instellingen"
                    onClick={onOpenSettings}
                    pressed={settingsOpen}
                    covered={hidden[0]}
                >
                    <Icon name="layers" size={22} />
                </MapButton>
                <MapButton
                    label="Mijn locatie als vertrekpunt"
                    onClick={onLocate}
                    covered={hidden[1]}
                >
                    <Icon name="locate" size={22} />
                </MapButton>
                <MapButton
                    label="Lijn zoeken"
                    onClick={onToggleLineSearch}
                    pressed={lineSearchOpen}
                    covered={hidden[2]}
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
