// Search pill over the map ("Zoekpil"): opens "Van en naar", the round button swaps

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

import SwapButton from "./swap-button"

// --- INTERFACES ---

interface SearchBarPlace {
    id: string
    name: string
}

interface SearchBarProps {
    from: SearchBarPlace | null
    to: SearchBarPlace | null
    onOpen: () => void
    onSwap: () => void
    className?: string
}

// --- HELPERS ---

/** "Utrecht, Kleinesingel" → "Kleinesingel": the town is clear from the map. */
const shortPlace = (name: string) => name.replace(/^[^,]+, /, "")

function titleOf(from: SearchBarPlace | null, to: SearchBarPlace | null): string {
    if (!from && !to) return "Waar wil je heen?"
    const fromLabel = from ? shortPlace(from.name) || "…" : "Van?"
    const toLabel = to ? shortPlace(to.name) || "…" : "Naar?"
    return `${fromLabel} → ${toLabel}`
}

// --- COMPONENT ---

export default function SearchBar({ from, to, onOpen, onSwap, className }: SearchBarProps) {
    return (
        <div
            className={cn(
                "bg-background flex h-14 items-center gap-2.5 rounded-full pr-1.5 pl-4 shadow-[0_4px_16px_rgba(0,0,0,0.18)]",
                className,
            )}
        >
            <button
                type="button"
                onClick={onOpen}
                className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left"
            >
                <span className="text-foreground">
                    <Icon name="search" size={20} />
                </span>
                <span className="min-w-0">
                    <span className="text-body-m text-foreground block truncate font-semibold">
                        {titleOf(from, to)}
                    </span>
                    {from && to && (
                        <span className="text-body-s text-muted block truncate">
                            {from.name} → {to.name}
                        </span>
                    )}
                </span>
            </button>
            <SwapButton onClick={onSwap} disabled={!from && !to} />
        </div>
    )
}
