// "Kom je met de trein?": the platforms of a nearby station, to start from where the train arrives

import { cva } from "class-variance-authority"

import type { TrainPlatform, TrainStation } from "@/features/board/board.types"

// --- STYLING ---

const platformVariants = cva("text-body-s h-10 min-w-10 rounded-lg px-2.5 font-semibold", {
    variants: {
        selected: {
            true: "bg-accent text-on-dark",
            false: "bg-surface hover:bg-border",
        },
    },
    defaultVariants: {
        selected: false,
    },
})

// --- INTERFACES ---

interface PlatformPickerProps {
    station: TrainStation
    /** The platform already chosen, marked so you can see it and switch. */
    selectedCode?: string
    onPick: (station: TrainStation, platform: TrainPlatform) => void
}

// --- COMPONENT ---

/** A big station is a long walk end to end: the fastest bus depends on the platform you arrive at. */
export default function PlatformPicker({ station, selectedCode, onPick }: PlatformPickerProps) {
    return (
        <div className="flex flex-col gap-1.5">
            <p className="text-body-s text-muted">
                Kom je met de trein? Kies je spoor op {station.name}:
            </p>
            <div className="flex flex-wrap gap-1.5">
                {station.platforms.map((platform) => (
                    <button
                        key={platform.code}
                        type="button"
                        onClick={() => onPick(station, platform)}
                        aria-label={`Vertrek vanaf spoor ${platform.code}`}
                        aria-pressed={
                            selectedCode === undefined ? undefined : platform.code === selectedCode
                        }
                        className={platformVariants({ selected: platform.code === selectedCode })}
                    >
                        {platform.code}
                    </button>
                ))}
            </div>
        </div>
    )
}
