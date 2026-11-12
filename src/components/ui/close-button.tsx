// Round close button ("Knop · Rond zacht" with Icoon/x)

import type { ComponentProps } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

// --- INTERFACES ---

interface CloseButtonProps extends Omit<ComponentProps<"button">, "children"> {
    /** Accessible name; the button only shows an icon. */
    label?: string
}

// --- COMPONENT ---

export function CloseButton({ label = "Sluiten", className, ...props }: CloseButtonProps) {
    return (
        <button
            type="button"
            aria-label={label}
            className={cn(
                "bg-surface text-foreground hover:bg-border flex size-11 shrink-0 items-center justify-center rounded-full",
                className,
            )}
            {...props}
        >
            <Icon name="x" size={22} />
        </button>
    )
}
