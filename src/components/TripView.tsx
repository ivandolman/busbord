import type { ReactNode } from "react";
import { delayMinutes, formatClock, formatWait, MODE_LABEL } from "@/lib/board/format";
import { shortHeadsign } from "@/lib/board/group";
import type { Board, Departure } from "@/lib/board/types";
import { LineBadge } from "./LineBadge";
import { Icon } from "./Icon";
import { CloseButton } from "./PanelHeader";

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** "Stap": clock time, a round symbol, what to do and a detail line. */
function Step({ time, symbol, symbolClass = "bg-oppervlak", title, detail }: { time: string; symbol: ReactNode; symbolClass?: string; title: ReactNode; detail?: string | null }) {
  return (
    <li className="flex min-h-12 items-center gap-3">
      <span className="w-[52px] shrink-0 text-cijfer-m tabular-nums">{time}</span>
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${symbolClass}`}>{symbol}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-m font-semibold">{title}</span>
        {detail && <span className="text-body-s text-tekst-zacht">{detail}</span>}
      </span>
    </li>
  );
}

/** One ride from the board, step by step, while its walks are drawn on the map. */
export function TripView({
  departure,
  board,
  now,
  onClose,
}: {
  departure: Departure;
  board: Board;
  now: number;
  onClose: () => void;
}) {
  const delay = delayMinutes(departure.plannedDeparture, departure.expectedDeparture);
  const towards = departure.headsign ? shortHeadsign(departure.headsign, board.origin.name) : MODE_LABEL[departure.mode];
  const mustWalk = departure.walkToSeconds > 0;
  const leave = formatWait(mustWalk ? departure.leaveAt : departure.expectedDeparture, now);
  const when = leave === "nu" ? "nu" : leave.includes(":") ? `om ${leave}` : `over ${leave}`;
  const late = delay >= 1 ? ` +${delay}` : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <LineBadge line={departure.line} mode={departure.mode} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-kop-l">→ {towards}</h2>
          <p className="text-body-s text-tekst-zacht">
            {departure.cancelled
              ? "Rit vervalt"
              : `${mustWalk ? "Ga lopen" : "Vertrekt"} ${when} · ${MODE_LABEL[departure.mode].toLowerCase()} ${formatClock(departure.expectedDeparture)}${late}`}
          </p>
        </div>
        <CloseButton onClick={onClose} label="Terug naar het bord" />
      </div>
      <ol className="flex flex-col gap-1.5">
        {mustWalk && (
          <Step
            time={formatClock(departure.leaveAt)}
            symbol={<Icon name="walk" size={18} className="text-lopen" />}
            symbolClass="bg-accent-zacht"
            title={`Loop naar ${departure.from.name}${departure.from.platform ? `, perron ${departure.from.platform}` : ""}`}
            detail={`${minutes(departure.walkToSeconds)} min · ${departure.from.walkMeters} m · blauwe stippellijn`}
          />
        )}
        <Step
          time={formatClock(departure.expectedDeparture)}
          symbol={<LineBadge line={departure.line} mode={departure.mode} />}
          title={`Lijn ${departure.line} → ${towards}${late ? ` ${late}` : ""}`}
          detail={[MODE_LABEL[departure.mode], mustWalk ? null : departure.from.name, departure.from.platform ? `perron ${departure.from.platform}` : null]
            .filter(Boolean)
            .join(" · ")}
        />
        <Step
          time={formatClock(departure.expectedArrival)}
          symbol={<Icon name="pin" size={18} />}
          title={`Uitstappen: ${departure.to.name}`}
          detail={departure.to.platform ? `perron ${departure.to.platform}` : null}
        />
        {departure.walkFromSeconds > 0 && (
          <Step
            time={formatClock(departure.doorArrival)}
            symbol={<Icon name="flag" size={18} className="text-bestemming" />}
            symbolClass="bg-waarschuwing-bg"
            title={`Aan ${formatClock(departure.doorArrival)} incl. lopen${departure.firstToArrive ? " · eerste daar" : ""}`}
            detail={`${minutes(departure.walkFromSeconds)} min lopen · rode stippellijn`}
          />
        )}
      </ol>
      <button
        type="button"
        onClick={onClose}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-oppervlak px-[18px] text-body-m font-semibold text-accent hover:bg-rand"
      >
        <Icon name="chevL" size={20} />
        Terug naar het bord
      </button>
    </div>
  );
}
