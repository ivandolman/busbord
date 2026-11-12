"use client";

import { delayMinutes, formatClock, formatWait, MODE_LABEL } from "@/lib/board/format";
import type { StopBoard, StopPole } from "@/lib/board/types";
import { Icon } from "./Icon";
import { LineBadge } from "./LineBadge";
import type { PlaceKey } from "./NetworkMap";

/** A direction at a stop: the poles whose buses go the same way next. */
interface StopDirection {
  key: string;
  towards: string | null;
  poleIds: Set<string>;
}

export function directionsOf(board: StopBoard): StopDirection[] {
  const byKey = new Map<string, StopDirection>();
  for (const pole of board.poles) {
    const key = pole.towards ?? "";
    const direction = byKey.get(key) ?? { key, towards: pole.towards, poleIds: new Set<string>() };
    direction.poleIds.add(pole.id);
    byKey.set(key, direction);
  }
  return [...byKey.values()];
}

/**
 * The direction to open on: with a destination, the one most rides there leave from (your side
 * of the street); otherwise every direction.
 */
export function defaultDirection(board: StopBoard): string | null {
  const directions = directionsOf(board);
  if (!board.destination || directions.length < 2) return null;
  let best: { key: string; count: number } | null = null;
  for (const direction of directions) {
    const count = board.departures.filter(
      (departure) => departure.toDestination && !departure.cancelled && direction.poleIds.has(departure.poleId),
    ).length;
    if (count > 0 && (!best || count > best.count)) best = { key: direction.key, count };
  }
  return best?.key ?? null;
}

/** "Paal": the pole's letter in a blue dot, the same as on the map. */
function PoleBadge({ pole }: { pole: StopPole }) {
  return (
    <span
      title={pole.towards ? `Halte ${pole.label}, richting ${pole.towards}` : `Halte ${pole.label}`}
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-label-xs tracking-normal text-op-donker"
    >
      {pole.label}
    </span>
  );
}

/**
 * "Haltekaart" / "Sheet – halte": a stop's next hour of departures, every line, with the ones that
 * reach the chosen destination ticked. With more than one direction, chips pick one.
 */
export function StopCard({
  name,
  lines,
  note,
  board,
  failed,
  direction,
  onDirection,
  onPick,
  onClose,
}: {
  name: string;
  lines: string[];
  note: string | null;
  board: StopBoard | null;
  failed: boolean;
  /** Selected direction key; null for every direction. */
  direction: string | null;
  onDirection: (key: string | null) => void;
  onPick: (key: PlaceKey) => void;
  onClose: () => void;
}) {
  const now = Math.floor(Date.now() / 1000);
  const directions = board ? directionsOf(board) : [];
  const selected = directions.find((candidate) => candidate.key === direction) ?? null;
  const visiblePoles = board ? (selected ? board.poles.filter((pole) => selected.poleIds.has(pole.id)) : board.poles) : [];
  const departures = board ? (selected ? board.departures.filter((departure) => selected.poleIds.has(departure.poleId)) : board.departures) : [];
  // Which pole to walk to: only worth showing when there is a choice or a walk to tell.
  const showPoles = board ? board.poles.length > 1 || board.poles.some((pole) => pole.walkMeters !== null) : false;
  const poleOf = new Map(board?.poles.map((pole) => [pole.id, pole]) ?? []);
  const direct = board?.destination ? board.departures.filter((departure) => departure.toDestination && !departure.cancelled).length : 0;

  return (
    <div className="flex flex-col gap-3 text-tekst">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-kop-xl">{name}</h2>
          {lines.length > 0 && <p className="text-body-s text-tekst-zacht">Lijnen {lines.join(", ")}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-oppervlak hover:bg-rand"
        >
          <Icon name="x" size={22} />
        </button>
      </div>
      <div className="flex gap-2">
        {(
          [
            ["from", "Van hier", "locate"],
            ["to", "Naar hier", "pin"],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-oppervlak px-[18px] text-body-m font-semibold text-accent hover:bg-rand"
          >
            <Icon name={icon} size={20} />
            {label}
          </button>
        ))}
      </div>
      {note && <p className="text-body-s text-waarschuwing">{note}</p>}
      {failed && !board && <p className="text-body-s text-tekst-zacht">Vertrektijden konden niet laden.</p>}
      {!failed && !board && <p className="text-body-s text-tekst-zacht">Vertrektijden laden…</p>}
      {board && board.destination && (
        <p className={`text-body-s font-semibold ${direct > 0 ? "text-succes" : "text-tekst-zacht"}`}>
          {direct > 0
            ? `${direct} ${direct === 1 ? "rit gaat" : "ritten gaan"} rechtstreeks naar ${board.destination.name} (✓)`
            : `Het komende uur gaat hier niets rechtstreeks naar ${board.destination.name}.`}
        </p>
      )}
      {directions.length > 1 && (
        <div role="group" aria-label="Richting" className="flex flex-wrap gap-1.5">
          {[{ key: null, label: "Alle richtingen" }, ...directions.map((candidate) => ({ key: candidate.key, label: candidate.towards ? `→ ${candidate.towards}` : "Overig" }))].map(
            (chip) => {
              const active = (selected?.key ?? null) === chip.key;
              return (
                <button
                  key={chip.key ?? "*"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onDirection(chip.key)}
                  className={`h-11 rounded-full px-3.5 text-body-s font-semibold ${active ? "bg-donker text-op-donker" : "bg-oppervlak text-tekst hover:bg-rand"}`}
                >
                  {chip.label}
                </button>
              );
            },
          )}
        </div>
      )}
      {showPoles && (
        <ul aria-label="Waar je instapt" className="flex flex-col gap-1">
          {visiblePoles.map((pole) => (
            <li key={pole.id} className="flex min-h-7 items-center gap-2.5 text-body-s">
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
      {board && board.departures.length === 0 && <p className="text-body-s text-tekst-zacht">Het komende uur vertrekt hier niets.</p>}
      {departures.length > 0 && (
        <ul className="flex flex-col">
          {departures.map((departure) => {
            const delay = delayMinutes(departure.plannedDeparture, departure.expectedDeparture);
            const pole = poleOf.get(departure.poleId);
            const other = board?.destination && !departure.toDestination;
            return (
              <li
                key={`${departure.tripId}-${departure.plannedDeparture}`}
                className={`flex min-h-12 items-center gap-2.5 border-t border-rand py-2 ${other ? "opacity-55" : ""}`}
              >
                <span className="flex w-[60px] shrink-0 items-baseline gap-0.5">
                  <span className={`text-body-m font-semibold tabular-nums ${departure.cancelled ? "text-fout line-through" : ""}`}>
                    {formatWait(departure.expectedDeparture, now)}
                  </span>
                  {!departure.cancelled && delay >= 1 && <span className="text-label-xs text-waarschuwing">+{delay}</span>}
                </span>
                <LineBadge line={departure.line} mode={departure.mode} />
                {showPoles && pole && <PoleBadge pole={pole} />}
                <span className="min-w-0 flex-1 truncate text-body-m">
                  {departure.cancelled ? "Rit vervalt" : departure.headsign ? `naar ${departure.headsign}` : MODE_LABEL[departure.mode]}
                  {!showPoles && departure.platform ? ` · perron ${departure.platform}` : ""}
                </span>
                {departure.toDestination && (
                  <span title="Gaat rechtstreeks naar je bestemming" className="text-succes">
                    <Icon name="check" size={20} />
                    <span className="sr-only">Gaat rechtstreeks naar je bestemming</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {board && (
        <p className="text-body-s text-tekst-zacht">
          Ververst elke 30 s · {board.realtime === "live" ? "Met actuele tijden" : "Volgens de dienstregeling"} · bijgewerkt {formatClock(board.generatedAt)}
        </p>
      )}
    </div>
  );
}
