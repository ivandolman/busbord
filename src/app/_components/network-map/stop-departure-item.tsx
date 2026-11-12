// One departure in a stop card: wait, line, pole, where it goes and whether it reaches the destination

import { cva } from "class-variance-authority"

import LineBadge from "@/app/_components/line-badge"
import { Icon } from "@/components/ui/icon"
import { RollingText } from "@/components/ui/rolling-text"
import type { StopDeparture, StopPole } from "@/features/board/board.types"
import { delayMinutes, formatWait, MODE_LABEL } from "@/features/board/format"

import PoleBadge from "./pole-badge"

// --- STYLING ---

const departureItemVariants = cva(
    "border-border flex min-h-12 items-center gap-2.5 border-t py-2",
    {
        variants: {
            relevance: {
                useful: "",
                // With a destination: a ride that does not go there.
                other: "opacity-55",
            },
        },
        defaultVariants: { relevance: "useful" },
    },
)

const waitVariants = cva("text-body-m font-semibold tabular-nums", {
    variants: {
        status: {
            running: "",
            cancelled: "text-error line-through",
        },
    },
    defaultVariants: { status: "running" },
})

// --- INTERFACES ---

interface StopDepartureItemProps {
    departure: StopDeparture
    /** The pole it leaves from, when the card shows poles. */
    pole: StopPole | null
    /** The card has a destination and this ride does not reach it. */
    other: boolean
    /** The card shows poles, so the platform is not repeated in the text. */
    showPoles: boolean
    now: number
}

// --- COMPONENT ---

export default function StopDepartureItem({
    departure,
    pole,
    other,
    showPoles,
    now,
}: StopDepartureItemProps) {
    const delay = delayMinutes(departure.plannedDeparture, departure.expectedDeparture)
    return (
        <li className={departureItemVariants({ relevance: other ? "other" : "useful" })}>
            <span className="flex w-[60px] shrink-0 items-baseline gap-0.5">
                <span
                    className={waitVariants({
                        status: departure.cancelled ? "cancelled" : "running",
                    })}
                >
                    <RollingText value={formatWait(departure.expectedDeparture, now)} />
                </span>
                {!departure.cancelled && delay >= 1 && (
                    <RollingText value={`+${delay}`} className="text-label-xs text-warning" />
                )}
            </span>
            <LineBadge line={departure.line} mode={departure.mode} />
            {pole && <PoleBadge pole={pole} />}
            <span className="text-body-m min-w-0 flex-1 truncate">
                {departure.cancelled
                    ? "Rit vervalt"
                    : departure.headsign
                      ? `naar ${departure.headsign}`
                      : MODE_LABEL[departure.mode]}
                {!showPoles && departure.platform ? ` · perron ${departure.platform}` : ""}
            </span>
            {departure.toDestination && (
                <span title="Gaat rechtstreeks naar je bestemming" className="text-success">
                    <Icon name="check" size={20} />
                    <span className="sr-only">Gaat rechtstreeks naar je bestemming</span>
                </span>
            )}
        </li>
    )
}
