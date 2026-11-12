// One ride from the board, step by step, while its walks are drawn on the map

import { Button } from "@/components/ui/button"
import { CloseButton } from "@/components/ui/close-button"
import { Icon } from "@/components/ui/icon"
import type { Board, Departure } from "@/features/board/board.types"
import { minutes, whenPhrase } from "@/features/board/departure-text"
import { delayMinutes, formatClock, formatWait, MODE_LABEL } from "@/features/board/format"
import { shortHeadsign } from "@/features/board/group"

import LineBadge from "./line-badge"
import TripStep from "./trip-step"

// --- INTERFACES ---

interface TripViewProps {
    departure: Departure
    board: Board
    now: number
    onClose: () => void
}

// --- COMPONENT ---

export default function TripView({ departure, board, now, onClose }: TripViewProps) {
    const delay = delayMinutes(departure.plannedDeparture, departure.expectedDeparture)
    const towards = departure.headsign
        ? shortHeadsign(departure.headsign, board.origin.name)
        : MODE_LABEL[departure.mode]
    const mustWalk = departure.walkToSeconds > 0
    const when = whenPhrase(
        formatWait(mustWalk ? departure.leaveAt : departure.expectedDeparture, now),
    )
    const late = delay >= 1 ? ` +${delay}` : ""
    const status = departure.cancelled
        ? "Rit vervalt"
        : `${mustWalk ? "Ga lopen" : "Vertrekt"} ${when} · ${MODE_LABEL[departure.mode].toLowerCase()} ${formatClock(departure.expectedDeparture)}${late}`

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <LineBadge line={departure.line} mode={departure.mode} size="lg" />
                <div className="flex min-w-0 flex-1 flex-col">
                    <h2 className="text-heading-l truncate">→ {towards}</h2>
                    <p className="text-body-s text-muted">{status}</p>
                </div>
                <CloseButton onClick={onClose} label="Terug naar het bord" />
            </div>
            <ol className="flex flex-col gap-1.5">
                {mustWalk && (
                    <TripStep
                        time={formatClock(departure.leaveAt)}
                        symbol={<Icon name="walk" size={18} className="text-walk" />}
                        tone="walk"
                        title={`Loop naar ${departure.from.name}${departure.from.platform ? `, perron ${departure.from.platform}` : ""}`}
                        detail={`${minutes(departure.walkToSeconds)} min · ${departure.from.walkMeters} m · blauwe stippellijn`}
                    />
                )}
                <TripStep
                    time={formatClock(departure.expectedDeparture)}
                    symbol={<LineBadge line={departure.line} mode={departure.mode} />}
                    title={`Lijn ${departure.line} → ${towards}${late ? ` ${late}` : ""}`}
                    detail={[
                        MODE_LABEL[departure.mode],
                        mustWalk ? null : departure.from.name,
                        departure.from.platform ? `perron ${departure.from.platform}` : null,
                    ]
                        .filter(Boolean)
                        .join(" · ")}
                />
                <TripStep
                    time={formatClock(departure.expectedArrival)}
                    symbol={<Icon name="pin" size={18} />}
                    title={`Uitstappen: ${departure.to.name}`}
                    detail={departure.to.platform ? `perron ${departure.to.platform}` : null}
                />
                {departure.walkFromSeconds > 0 && (
                    <TripStep
                        time={formatClock(departure.doorArrival)}
                        symbol={<Icon name="flag" size={18} className="text-destination" />}
                        tone="destination"
                        title={`Aan ${formatClock(departure.doorArrival)} incl. lopen${departure.firstToArrive ? " · eerste daar" : ""}`}
                        detail={`${minutes(departure.walkFromSeconds)} min lopen · rode stippellijn`}
                    />
                )}
            </ol>
            <Button onClick={onClose} className="w-full">
                <Icon name="chevL" size={20} />
                Terug naar het bord
            </Button>
        </div>
    )
}
