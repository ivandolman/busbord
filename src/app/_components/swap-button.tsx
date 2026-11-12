// Round button that swaps "Van" and "Naar"

import type { ComponentProps } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

// --- INTERFACES ---

type SwapButtonProps = Omit<ComponentProps<"button">, "children">

// --- COMPONENT ---

export default function SwapButton({ className, ...props }: SwapButtonProps) {
    return (
        <button
            type="button"
            aria-label="Wissel richting"
            title="Wissel richting"
            className={cn(
                "bg-surface text-foreground hover:bg-border flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40",
                className,
            )}
            {...props}
        >
            <Icon name="swap" size={22} />
        </button>
    )
}
