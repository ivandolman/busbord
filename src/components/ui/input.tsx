// Text-like input in the design's bordered field style

import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

// --- INTERFACES ---

type InputProps = ComponentProps<"input">

// --- COMPONENT ---

export function Input({ className, ...props }: InputProps) {
    return (
        <input
            className={cn(
                "border-border bg-background text-body-m h-11 rounded-lg border px-3",
                className,
            )}
            {...props}
        />
    )
}
