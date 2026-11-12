// The line search field over the map, with every line number as a suggestion

"use client"

import { cva } from "class-variance-authority"

import { Icon } from "@/components/ui/icon"
import { MODE_LABEL } from "@/features/board/format"
import type { NetworkLine } from "@/features/network/network.service"
import { cn } from "@/lib/utils"

// --- STYLING ---

const lineSearchVariants = cva(
    "absolute top-[calc(var(--map-top)+0.75rem)] left-3 z-[1000] h-11 w-[260px] items-center gap-2 " +
        "bg-background text-body-s rounded-full px-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.16)] lg:top-6 " +
        "lg:left-6 lg:flex",
    {
        variants: {
            visibility: {
                shown: "flex",
                hidden: "hidden",
            },
        },
        defaultVariants: { visibility: "hidden" },
    },
)

// --- INTERFACES ---

interface LineSearchProps {
    value: string
    onChange: (value: string) => void
    /** One line per line number, offered as suggestions. */
    suggestions: NetworkLine[]
    /** Phone only: show the field (on a wide screen it is always there). */
    open: boolean
    className?: string
}

// --- COMPONENT ---

export default function LineSearch({
    value,
    onChange,
    suggestions,
    open,
    className,
}: LineSearchProps) {
    return (
        <label
            className={cn(lineSearchVariants({ visibility: open ? "shown" : "hidden" }), className)}
        >
            <Icon name="search" size={18} className="text-foreground" />
            <span className="sr-only">Lijn zoeken</span>
            <input
                name="line"
                list="network-lines"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder="Zoek een lijn (bijv. 28)"
                maxLength={10}
                className="text-foreground placeholder:text-muted h-full min-w-0 flex-1 bg-transparent outline-none"
            />
            <datalist id="network-lines">
                {suggestions.map((line) => (
                    <option key={line.id} value={line.line}>
                        {MODE_LABEL[line.mode]} {line.name}
                    </option>
                ))}
            </datalist>
            {value && (
                <button
                    type="button"
                    onClick={() => onChange("")}
                    aria-label="Alle lijnen tonen"
                    className="text-muted hover:bg-surface -mr-2 flex size-9 items-center justify-center rounded-full"
                >
                    <Icon name="x" size={18} />
                </button>
            )}
        </label>
    )
}
