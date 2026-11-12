// The status line in the bottom corner of the map: loading, no results, or what a tap will pick

import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// --- STYLING ---

const mapLegendVariants = cva(
    "pointer-events-none absolute bottom-[calc(min(var(--sheet-h,0px),var(--app-h,100dvh)*0.55)+0.75rem)] " +
        "left-[max(0.75rem,env(safe-area-inset-left))] z-[1000] max-w-[70%] rounded-[10px] px-[9px] " +
        "text-body-s py-[5px] font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.16)] lg:bottom-6 lg:left-6",
    {
        variants: {
            tone: {
                info: "bg-background text-foreground",
                picking: "bg-dark text-on-dark",
            },
        },
        defaultVariants: { tone: "info" },
    },
)

// --- INTERFACES ---

interface MapLegendProps {
    message: string
    /** The next tap on the map picks a place: stand out from the map. */
    picking: boolean
    className?: string
}

// --- COMPONENT ---

export default function MapLegend({ message, picking, className }: MapLegendProps) {
    return (
        <p className={cn(mapLegendVariants({ tone: picking ? "picking" : "info" }), className)}>
            {message}
        </p>
    )
}
