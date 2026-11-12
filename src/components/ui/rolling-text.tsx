// Text that rolls in when its value changes, so a new time or delay catches the eye

"use client"

import { useState, type ComponentProps } from "react"

import { cn } from "@/lib/utils"

// --- INTERFACES ---

interface RollingTextProps extends Omit<ComponentProps<"span">, "children"> {
    value: string
}

// --- COMPONENT ---

/** Still on first render; only a later change rolls (keyed, so each new value animates). */
export function RollingText({ value, className, ...props }: RollingTextProps) {
    const [previous, setPrevious] = useState(value)
    const [changed, setChanged] = useState(false)
    if (value !== previous) {
        setPrevious(value)
        setChanged(true)
    }
    return (
        <span
            key={value}
            className={cn(
                "inline-block",
                changed && "animate-value-roll motion-reduce:animate-none",
                className,
            )}
            {...props}
        >
            {value}
        </span>
    )
}
