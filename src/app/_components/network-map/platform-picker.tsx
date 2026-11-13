// "Kom je met de trein?": the platforms of a nearby station, to start from where the train arrives

import type { TrainPlatform, TrainStation } from "@/features/board/board.types"

// --- INTERFACES ---

interface PlatformPickerProps {
    station: TrainStation
    onPick: (station: TrainStation, platform: TrainPlatform) => void
}

// --- COMPONENT ---

/** A big station is a long walk end to end: the fastest bus depends on the platform you arrive at. */
export default function PlatformPicker({ station, onPick }: PlatformPickerProps) {
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
                        className="bg-surface text-body-s hover:bg-border h-10 min-w-10 rounded-lg px-2.5 font-semibold"
                    >
                        {platform.code}
                    </button>
                ))}
            </div>
        </div>
    )
}
