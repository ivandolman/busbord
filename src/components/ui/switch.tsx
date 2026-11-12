// On/off switch ("Schakelaar", 51×31) drawn over a real checkbox

"use client"

import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

// --- INTERFACES ---

interface SwitchProps extends Omit<
    ComponentProps<"input">,
    "type" | "role" | "checked" | "onChange"
> {
    checked: boolean
    onChange: (checked: boolean) => void
}

// --- COMPONENT ---

/** Has no label of its own: place it inside a <label> row, which is also the touch target. */
export function Switch({ checked, onChange, className, ...props }: SwitchProps) {
    return (
        <span className={cn("relative inline-flex h-[31px] w-[51px] shrink-0", className)}>
            <input
                type="checkbox"
                role="switch"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                {...props}
            />
            <span className="bg-border peer-checked:bg-success peer-focus-visible:ring-accent absolute inset-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-disabled:opacity-50" />
            <span className="bg-background absolute top-[2px] left-[2px] size-[27px] rounded-full shadow transition-transform peer-checked:translate-x-5" />
        </span>
    )
}
