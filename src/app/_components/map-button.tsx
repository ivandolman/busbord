// Round floating button on the map ("Knop · Rond" in the design)

import type { ComponentProps } from "react"

import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// --- STYLING ---

const mapButtonVariants = cva(
    "flex size-11 items-center justify-center rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.16)]",
    {
        variants: {
            pressed: {
                true: "bg-dark text-on-dark",
                false: "bg-background text-foreground hover:bg-surface",
            },
        },
        defaultVariants: {
            pressed: false,
        },
    },
)

// --- INTERFACES ---

interface MapButtonProps extends ComponentProps<"button"> {
    /** Accessible name and tooltip; the button only shows an icon. */
    label: string
    /** A toggle: shown dark while on. Leave out for a plain action. */
    pressed?: boolean
}

// --- COMPONENT ---

export default function MapButton({ label, pressed, className, ...props }: MapButtonProps) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            className={cn(mapButtonVariants({ pressed: pressed ?? false }), className)}
            {...props}
        />
    )
}
