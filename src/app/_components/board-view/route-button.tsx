// "Route" button (walk route on the map), only when the departure has a walk to show

import { cva, type VariantProps } from "class-variance-authority"

import { Icon } from "@/components/ui/icon"
import type { Departure } from "@/features/board/board.types"
import { cn } from "@/lib/utils"

// --- STYLING ---

const routeButtonVariants = cva("text-body-s flex h-11 items-center", {
    variants: {
        variant: {
            /** On the light rows of the board. */
            outline: "border-border text-foreground hover:bg-surface rounded-lg border px-3",
            /** On the dark "Pak deze" card. */
            inverted:
                "border-on-dark text-on-dark gap-2 rounded-[10px] border px-3.5 font-semibold hover:bg-white/10",
        },
    },
    defaultVariants: {
        variant: "outline",
    },
})

// --- INTERFACES ---

/** Shows a departure's walks on the map. */
export type ShowRoute = (departure: Departure) => void

interface RouteButtonProps extends VariantProps<typeof routeButtonVariants> {
    departure: Departure
    onShowRoute?: ShowRoute
    className?: string
}

// --- COMPONENT ---

export default function RouteButton({
    departure,
    onShowRoute,
    variant,
    className,
}: RouteButtonProps) {
    if (
        !onShowRoute ||
        departure.cancelled ||
        (departure.walkToSeconds === 0 && departure.walkFromSeconds === 0)
    )
        return null
    return (
        <button
            type="button"
            onClick={() => onShowRoute(departure)}
            aria-label="Looproute op kaart"
            className={cn(routeButtonVariants({ variant }), className)}
        >
            {variant === "inverted" && <Icon name="walk" size={18} />}
            Route
        </button>
    )
}
