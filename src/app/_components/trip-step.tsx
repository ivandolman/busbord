// "Stap" of a ride: clock time, a round symbol, what to do and a detail line

import type { ReactNode } from "react"

import { cva, type VariantProps } from "class-variance-authority"

// --- STYLING ---

const symbolVariants = cva("flex size-9 shrink-0 items-center justify-center rounded-full", {
    variants: {
        tone: {
            neutral: "bg-surface",
            walk: "bg-accent-soft",
            destination: "bg-warning-bg",
        },
    },
    defaultVariants: {
        tone: "neutral",
    },
})

// --- INTERFACES ---

interface TripStepProps extends VariantProps<typeof symbolVariants> {
    time: string
    symbol: ReactNode
    title: ReactNode
    detail?: string | null
}

// --- COMPONENT ---

export default function TripStep({ time, symbol, tone, title, detail }: TripStepProps) {
    return (
        <li className="flex min-h-12 items-center gap-3">
            <span className="text-figure-m w-[52px] shrink-0 tabular-nums">{time}</span>
            <span className={symbolVariants({ tone })}>{symbol}</span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-m font-semibold">{title}</span>
                {detail && <span className="text-body-s text-muted">{detail}</span>}
            </span>
        </li>
    )
}
