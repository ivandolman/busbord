// Line number on the line's own colour ("Lijnbadge" in the design)

"use client"

import { cva, type VariantProps } from "class-variance-authority"

import type { Mode } from "@/features/board/board.types"
import { MODE_LABEL } from "@/features/board/format"
import { textOn, useLineColor } from "@/hooks/use-network"
import { cn } from "@/lib/utils"

// --- STYLING ---

/** M in lists, L in "Pak deze"; sm only where space is tight. */
const lineBadgeVariants = cva("inline-flex shrink-0 items-center justify-center tabular-nums", {
    variants: {
        size: {
            sm: "text-body-s min-w-7 rounded-[5px] px-[5px] py-px font-bold",
            md: "text-badge-m min-w-[34px] rounded-[6px] px-[7px] py-[3px]",
            lg: "text-badge-l min-w-[52px] rounded-[9px] px-[10px] py-[5px]",
        },
    },
    defaultVariants: {
        size: "md",
    },
})

// --- INTERFACES ---

interface LineBadgeProps extends VariantProps<typeof lineBadgeVariants> {
    line: string
    mode: Mode
    className?: string
}

// --- COMPONENT ---

/** The colour is the operator's (U-OV yellow, green, …), or the mode's until the network is in. */
export default function LineBadge({ line, mode, size, className }: LineBadgeProps) {
    const color = useLineColor(line, mode)
    return (
        <span
            className={cn(lineBadgeVariants({ size }), className)}
            style={{ background: color, color: textOn(color) }}
        >
            <span className="sr-only">{MODE_LABEL[mode]} </span>
            {line || "?"}
        </span>
    )
}
