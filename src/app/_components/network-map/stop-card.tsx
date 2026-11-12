// "Haltekaart" / "Sheet – halte": a stop's next hour of departures, every line

"use client"

import { cva } from "class-variance-authority"

import { Icon } from "@/components/ui/icon"
import type { StopBoard } from "@/features/board/board.types"
import { formatClock } from "@/features/board/format"

import DirectionChips from "./direction-chips"
import type { PlaceKey } from "./network-map.types"
import PoleBadge from "./pole-badge"
import StopDepartureItem from "./stop-departure-item"
import { directionsOf } from "./stop-directions"

// --- CONSTANTS ---

const PICK_ACTIONS = [
    { key: "from", label: "Van hier", icon: "locate" },
    { key: "to", label: "Naar hier", icon: "pin" },
] as const

// --- STYLING ---

const directSummaryVariants = cva("text-body-s font-semibold", {
    variants: {
        reach: {
            none: "text-muted",
            direct: "text-success",
        },
    },
    defaultVariants: { reach: "none" },
})

// --- INTERFACES ---

interface StopCardProps {
    name: string
    lines: string[]
    note: string | null
    board: StopBoard | null
    failed: boolean
    /** Selected direction key; null for every direction. */
    direction: string | null
    /** Epoch seconds the waits are counted from. */
    now: number
    onDirection: (key: string | null) => void
    onPick: (key: PlaceKey) => void
    onClose: () => void
}

// --- COMPONENT ---

/**
 * The ones that reach the chosen destination are ticked. With more than one direction, chips
 * pick one.
 */
export default function StopCard({
    name,
    lines,
    note,
    board,
    failed,
    direction,
    now,
    onDirection,
    onPick,
    onClose,
}: StopCardProps) {
    const directions = board ? directionsOf(board) : []
    const selected = directions.find((candidate) => candidate.key === direction) ?? null
    const visiblePoles = board
        ? selected
            ? board.poles.filter((pole) => selected.poleIds.has(pole.id))
            : board.poles
        : []
    const departures = board
        ? selected
            ? board.departures.filter((departure) => selected.poleIds.has(departure.poleId))
            : board.departures
        : []
    // Which pole to walk to: only worth showing when there is a choice or a walk to tell.
    const showPoles = board
        ? board.poles.length > 1 || board.poles.some((pole) => pole.walkMeters !== null)
        : false
    const poleOf = new Map(board?.poles.map((pole) => [pole.id, pole]) ?? [])
    const direct = board?.destination
        ? board.departures.filter((departure) => departure.toDestination && !departure.cancelled)
              .length
        : 0

    return (
        <div className="text-foreground flex flex-col gap-3">
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <h2 className="text-heading-xl">{name}</h2>
                    {lines.length > 0 && (
                        <p className="text-body-s text-muted">Lijnen {lines.join(", ")}</p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Sluiten"
                    className="bg-surface hover:bg-border flex size-11 shrink-0 items-center justify-center rounded-full"
                >
                    <Icon name="x" size={22} />
                </button>
            </div>
            <div className="flex gap-2">
                {PICK_ACTIONS.map(({ key, label, icon }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onPick(key)}
                        className="bg-surface text-body-m text-accent hover:bg-border flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-[18px] font-semibold"
                    >
                        <Icon name={icon} size={20} />
                        {label}
                    </button>
                ))}
            </div>
            {note && <p className="text-body-s text-warning">{note}</p>}
            {failed && !board && (
                <p className="text-body-s text-muted">Vertrektijden konden niet laden.</p>
            )}
            {!failed && !board && <p className="text-body-s text-muted">Vertrektijden laden…</p>}
            {board && board.destination && (
                <p className={directSummaryVariants({ reach: direct > 0 ? "direct" : "none" })}>
                    {direct > 0
                        ? `${direct} ${direct === 1 ? "rit gaat" : "ritten gaan"} rechtstreeks naar ${board.destination.name} (✓)`
                        : `Het komende uur gaat hier niets rechtstreeks naar ${board.destination.name}.`}
                </p>
            )}
            {directions.length > 1 && (
                <DirectionChips
                    directions={directions}
                    selected={selected?.key ?? null}
                    onSelect={onDirection}
                />
            )}
            {showPoles && (
                <ul aria-label="Waar je instapt" className="flex flex-col gap-1">
                    {visiblePoles.map((pole) => (
                        <li key={pole.id} className="text-body-s flex min-h-7 items-center gap-2.5">
                            <PoleBadge pole={pole} />
                            <span className="min-w-0 flex-1">
                                {[
                                    pole.towards ? `richting ${pole.towards}` : "halte",
                                    pole.walkMeters === 0
                                        ? "je vertrekpunt"
                                        : pole.walkSeconds !== null
                                          ? `${pole.walkMeters} m · ${Math.max(1, Math.round(pole.walkSeconds / 60))} min lopen`
                                          : null,
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {board && board.departures.length === 0 && (
                <p className="text-body-s text-muted">Het komende uur vertrekt hier niets.</p>
            )}
            {departures.length > 0 && (
                <ul className="flex flex-col">
                    {departures.map((departure) => (
                        <StopDepartureItem
                            key={`${departure.tripId}-${departure.plannedDeparture}`}
                            departure={departure}
                            pole={showPoles ? (poleOf.get(departure.poleId) ?? null) : null}
                            other={Boolean(board?.destination) && !departure.toDestination}
                            showPoles={showPoles}
                            now={now}
                        />
                    ))}
                </ul>
            )}
            {board && (
                <p className="text-body-s text-muted">
                    Ververst elke 30 s ·{" "}
                    {board.realtime === "live" ? "Met actuele tijden" : "Volgens de dienstregeling"}{" "}
                    · bijgewerkt {formatClock(board.generatedAt)}
                </p>
            )}
        </div>
    )
}
