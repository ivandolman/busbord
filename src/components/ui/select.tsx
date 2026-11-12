// Native select dressed as the design's value box with a chevron ("Keuze")

import type { ComponentProps } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

// --- INTERFACES ---

type SelectProps = ComponentProps<"select">

// --- COMPONENT ---

export function Select({ className, children, ...props }: SelectProps) {
    return (
        <span className="relative inline-flex shrink-0">
            <select
                className={cn(
                    "border-border bg-background text-body-m text-foreground h-11 appearance-none rounded-lg border pr-8 pl-3 font-semibold disabled:opacity-50",
                    className,
                )}
                {...props}
            >
                {children}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2">
                <Icon name="chevD" size={16} />
            </span>
        </span>
    )
}
