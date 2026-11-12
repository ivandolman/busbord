// Chips that narrow a stop's departures to one direction, or show every direction

"use client"

import { cva } from "class-variance-authority"

import type { StopDirection } from "./stop-directions"

// --- STYLING ---

const directionChipVariants = cva("text-body-s h-11 rounded-full px-3.5 font-semibold", {
    variants: {
        state: {
            idle: "bg-surface text-foreground hover:bg-border",
            selected: "bg-dark text-on-dark",
        },
    },
    defaultVariants: { state: "idle" },
})

// --- INTERFACES ---

interface DirectionChipsProps {
    directions: StopDirection[]
    /** Key of the selected direction; null for every direction. */
    selected: string | null
    onSelect: (key: string | null) => void
}

// --- COMPONENT ---

export default function DirectionChips({ directions, selected, onSelect }: DirectionChipsProps) {
    const chips = [
        { key: null, label: "Alle richtingen" },
        ...directions.map((direction) => ({
            key: direction.key,
            label: direction.towards ? `→ ${direction.towards}` : "Overig",
        })),
    ]
    return (
        <div role="group" aria-label="Richting" className="flex flex-wrap gap-1.5">
            {chips.map((chip) => {
                const active = selected === chip.key
                return (
                    <button
                        key={chip.key ?? "*"}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSelect(chip.key)}
                        className={directionChipVariants({ state: active ? "selected" : "idle" })}
                    >
                        {chip.label}
                    </button>
                )
            })}
        </div>
    )
}
