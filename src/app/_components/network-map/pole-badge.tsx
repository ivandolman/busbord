// "Paal": a pole's letter in a blue dot, the same as on the map

import type { StopPole } from "@/features/board/board.types"

// --- INTERFACES ---

interface PoleBadgeProps {
    pole: StopPole
}

// --- COMPONENT ---

export default function PoleBadge({ pole }: PoleBadgeProps) {
    return (
        <span
            title={
                pole.towards
                    ? `Halte ${pole.label}, richting ${pole.towards}`
                    : `Halte ${pole.label}`
            }
            className="bg-accent text-label-xs text-on-dark flex size-6 shrink-0 items-center justify-center rounded-full tracking-normal"
        >
            {pole.label}
        </span>
    )
}
