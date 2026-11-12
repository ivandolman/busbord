import { delayMinutes, formatClock, formatWait, MODE_LABEL } from "@/lib/board/format";
import { isUseful, overview, shortHeadsign, type DepartureGroup } from "@/lib/board/group";
import type { Board, Departure, Transfer } from "@/lib/board/types";
import { Icon } from "./Icon";
import { LineBadge } from "./LineBadge";

const REALTIME_NOTE: Record<Board["realtime"], string> = {
  live: "Met actuele tijden",
  unavailable: "Actuele tijden zijn nu niet beschikbaar. Je ziet de dienstregeling.",
  disabled: "Volgens de dienstregeling, zonder actuele tijden",
};

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** "Utrecht, Padualaan" reads as "Padualaan" next to a stop in the same place. */
function shortStop(name: string, originName: string): string {
  return shortHeadsign(name.replace(/ \([^)]*\)$/, ""), originName.replace(/^Bij /, ""));
}

/** "Lopen: 6 min naar Padualaan, 4 min vanaf Kleinesingel", or null when you board and get off where you asked. */
function walkLine(departure: Departure, originName: string, destinationName: string): string | null {
  const parts = [
    departure.walkToSeconds > 0
      ? `${minutes(departure.walkToSeconds)} min naar ${shortStop(departure.from.name, originName)}`
      : null,
    departure.walkFromSeconds > 0
      ? `${minutes(departure.walkFromSeconds)} min vanaf ${shortStop(departure.to.name, destinationName)}`
      : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const total = departure.walkToSeconds + departure.walkFromSeconds;
  return `Lopen: ${parts.join(", ")}${parts.length > 1 ? ` (~${minutes(total)} min)` : ""}`;
}

/** Shows a departure's walks on the map. */
export type ShowRoute = (departure: Departure) => void;

/** "Looproute op kaart" ("Knop Looproute"), only when there is a walk to show. */
function RouteButton({ departure, onShowRoute, inverted = false }: { departure: Departure; onShowRoute?: ShowRoute; inverted?: boolean }) {
  if (!onShowRoute || departure.cancelled || (departure.walkToSeconds === 0 && departure.walkFromSeconds === 0)) return null;
  return (
    <button
      type="button"
      onClick={() => onShowRoute(departure)}
      className={
        inverted
          ? "flex h-11 items-center gap-2 rounded-[10px] border border-op-donker px-3.5 text-body-s font-semibold text-op-donker hover:bg-white/10"
          : "flex h-11 items-center rounded-lg border border-rand px-3 text-body-s text-tekst hover:bg-oppervlak"
      }
    >
      {inverted && <Icon name="walk" size={18} />}
      Looproute op kaart
    </button>
  );
}

/** "Rit-rij": one ride of an opened line, with its status. */
function DepartureRow({
  departure,
  originName,
  destinationName,
  now,
  onShowRoute,
}: {
  departure: Departure;
  originName: string;
  destinationName: string;
  now: number;
  onShowRoute?: ShowRoute;
}) {
  const delay = delayMinutes(departure.plannedDeparture, departure.expectedDeparture);
  const overtaken = departure.overtakenBy !== null;
  const where = [
    departure.from.platform ? `perron ${departure.from.platform}` : null,
    departure.headsign ? `naar ${shortHeadsign(departure.headsign, originName)}` : null,
  ].filter(Boolean);
  const walking = walkLine(departure, originName, destinationName);
  const leaveIn = Math.floor((departure.leaveAt - now) / 60);
  const muted = overtaken || !departure.catchable;

  return (
    <li className={`flex items-center gap-3 border-t border-rand p-3 ${!departure.catchable && !departure.cancelled ? "opacity-60" : ""}`}>
      <LineBadge line={departure.line} mode={departure.mode} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <p className="flex items-baseline gap-1.5">
          <span className={`text-body-m font-semibold ${departure.cancelled ? "text-fout line-through" : "text-tekst"}`}>
            {formatWait(departure.expectedDeparture, now)}
          </span>
          {!departure.cancelled && delay >= 1 && <span className="text-label-xs text-waarschuwing">+{delay}</span>}
        </p>
        <p className={`text-body-s ${departure.cancelled ? "text-fout" : "text-tekst-zacht"}`}>
          {departure.cancelled ? "Rit vervalt" : [MODE_LABEL[departure.mode], ...where].join(" · ")}
        </p>
        {walking && !departure.cancelled && (
          <p className={`text-body-s ${departure.catchable ? "text-tekst-zacht" : "text-waarschuwing"}`}>
            {walking}
            {departure.walkToSeconds > 0 &&
              (departure.catchable ? (leaveIn <= 0 ? " · nu vertrekken" : ` · vertrek over ${leaveIn} min`) : " · te krap om te halen")}
          </p>
        )}
        {departure.catchable && <RouteButton departure={departure} onShowRoute={onShowRoute} />}
      </div>
      <div className={`flex shrink-0 flex-col items-end gap-px ${muted || departure.cancelled ? "text-tekst-zacht" : ""}`}>
        <p className="text-body-m font-semibold tabular-nums">{departure.cancelled ? "–" : formatClock(departure.doorArrival)}</p>
        {departure.walkFromSeconds > 0 && !departure.cancelled && (
          <p className={`text-body-s ${muted ? "" : "text-tekst-zacht"}`}>incl. lopen</p>
        )}
        {departure.firstToArrive && <p className="text-body-s text-succes">Eerste daar</p>}
        {overtaken && <p className="text-body-s">Ingehaald door {departure.overtakenBy}</p>}
      </div>
    </li>
  );
}

/** Minutes until an epoch time, as "nu", "4 min" or a clock time from an hour on. */
const inMinutes = (epoch: number, now: number) => formatWait(epoch, now);

/** "Pak deze": the one departure to take. */
function PickCard({
  pick,
  then,
  board,
  now,
  onShowRoute,
}: {
  pick: Departure;
  then: Departure[];
  board: Board;
  now: number;
  onShowRoute?: ShowRoute;
}) {
  const delay = delayMinutes(pick.plannedDeparture, pick.expectedDeparture);
  const walking = walkLine(pick, board.origin.name, board.destination.name);
  const mustWalk = pick.walkToSeconds > 0;
  const leave = inMinutes(mustWalk ? pick.leaveAt : pick.expectedDeparture, now);
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl bg-donker p-4 text-op-donker">
      <p className="text-label-xs uppercase">Pak deze</p>
      <div className="flex items-center gap-3">
        <LineBadge line={pick.line} mode={pick.mode} size="lg" />
        <p className="min-w-0 text-kop-l">
          <span className="sr-only">richting </span>→ {pick.headsign ? shortHeadsign(pick.headsign, board.origin.name) : "?"}
        </p>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-cijfer-l tabular-nums">
          {mustWalk ? "Ga lopen " : "Vertrekt "}
          {leave === "nu" ? "nu" : leave.includes(":") ? `om ${leave}` : `over ${leave}`}
        </span>
        {delay >= 1 && <span className="text-body-m font-semibold text-waarschuwing-op-donker">+{delay}</span>}
      </p>
      <p className="text-body-s">
        {[
          pick.from.platform ? `Perron ${pick.from.platform}` : null,
          mustWalk ? `bus ${inMinutes(pick.expectedDeparture, now) === "nu" ? "vertrekt nu" : `over ${inMinutes(pick.expectedDeparture, now)}`}` : null,
          `aan ${formatClock(pick.doorArrival)}${pick.walkFromSeconds > 0 ? " incl. lopen" : ""}`,
          pick.firstToArrive ? "eerste daar" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {walking && <p className="text-body-s">{walking}</p>}
      <RouteButton departure={pick} onShowRoute={onShowRoute} inverted />
      {then.length > 0 && (
        <p className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 border-t border-op-donker/25 pt-2.5 text-body-s">
          <span>Daarna</span>
          {then.map((next) => (
            <span key={`${next.tripId}-${next.plannedDeparture}`} className="inline-flex items-center gap-2">
              <LineBadge line={next.line} mode={next.mode} />
              <span className="font-semibold">{inMinutes(next.expectedDeparture, now)}</span>
              {next.walkToSeconds > 0 && <span>(eerst {minutes(next.walkToSeconds)} min lopen)</span>}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

const MAX_TIMES = 3;

/** "Lijngroep": one line and direction with its next three times; opens to every ride. */
function GroupRow({
  group,
  board,
  now,
  onShowRoute,
}: {
  group: DepartureGroup;
  board: Board;
  now: number;
  onShowRoute?: ShowRoute;
}) {
  const lead = group.best ?? group.departures[0];
  if (!lead) return null;
  const shown = group.departures.slice(0, MAX_TIMES);
  // "4 · 19 · 34 min" reads best; once a time is a clock time ("13:05") every chip says its own unit.
  const allMinutes = shown.every((departure) => formatWait(departure.expectedDeparture, now).endsWith(" min"));
  const meta = [
    lead.from.platform ? `perron ${lead.from.platform}` : null,
    lead.walkToSeconds > 0 ? `${minutes(lead.walkToSeconds)} min lopen naar ${shortStop(lead.from.name, board.origin.name)}` : null,
    group.best ? `aan ${formatClock(group.best.doorArrival)}` : null,
  ].filter(Boolean);
  const reason = group.best
    ? null
    : group.departures.every((departure) => departure.cancelled)
      ? "vervalt"
      : group.departures.some((departure) => !departure.catchable && !departure.cancelled && departure.overtakenBy === null)
        ? "haal je niet meer"
        : "trager dan andere lijnen";

  return (
    <li className="border-t border-rand">
      <details className="group/row">
        <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-2.5 py-3 [&::-webkit-details-marker]:hidden">
          <LineBadge line={group.line} mode={group.mode} />
          <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${group.best ? "" : "opacity-60"}`}>
            <p className="line-clamp-2 text-body-m font-semibold break-words">→ {group.direction || MODE_LABEL[group.mode]}</p>
            <p className="line-clamp-2 text-body-s text-tekst-zacht">{[MODE_LABEL[group.mode], ...meta, reason].filter(Boolean).join(" · ")}</p>
          </div>
          <p className="flex shrink-0 items-baseline gap-[3px] tabular-nums">
            {shown.map((departure) => {
              const delay = delayMinutes(departure.plannedDeparture, departure.expectedDeparture);
              const useful = isUseful(departure);
              return (
                <span
                  key={`${departure.tripId}-${departure.plannedDeparture}`}
                  title={
                    departure.cancelled
                      ? "Rit vervalt"
                      : !departure.catchable
                        ? "Haal je niet lopend"
                        : departure.overtakenBy
                          ? `Ingehaald door ${departure.overtakenBy}`
                          : undefined
                  }
                  className={`flex gap-px rounded px-1.5 py-0.5 text-body-s font-semibold ${
                    departure.cancelled ? "text-fout line-through" : useful ? "bg-oppervlak text-tekst" : "text-tekst-zacht"
                  }`}
                >
                  {allMinutes ? formatWait(departure.expectedDeparture, now).replace(" min", "") : formatWait(departure.expectedDeparture, now)}
                  {!departure.cancelled && delay >= 1 && <span className="text-label-xs text-waarschuwing">+{delay}</span>}
                </span>
              );
            })}
            {allMinutes && <span className="text-body-s text-tekst-zacht">min</span>}
          </p>
          <span aria-hidden="true" className="text-kop-m text-tekst-zacht transition-transform group-open/row:rotate-90">
            ›
          </span>
        </summary>
        <ul className="mb-2 rounded-xl bg-oppervlak/60">
          {group.departures.map((departure) => (
            <DepartureRow
              key={`${departure.tripId}-${departure.plannedDeparture}`}
              departure={departure}
              originName={board.origin.name}
              destinationName={board.destination.name}
              now={now}
              onShowRoute={onShowRoute}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}

/** "Meldingen": diversions and other notices, one line each, the full text on a tap. */
function Alerts({ alerts }: { alerts: Board["alerts"] }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-label="Meldingen" className="flex flex-col gap-2 rounded-[14px] border border-waarschuwing-rand bg-waarschuwing-bg p-3 text-waarschuwing">
      {alerts.map((alert) => (
        <details key={alert.id} className="group">
          <summary className="flex cursor-pointer list-none items-start gap-2 font-semibold [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="text-body-m">⚠</span>
            <span className="line-clamp-2 flex-1 text-body-s group-open:line-clamp-none">{alert.header}</span>
          </summary>
          {alert.description && alert.description !== alert.header && (
            <p className="mt-1 pl-6 text-body-s whitespace-pre-line">{alert.description}</p>
          )}
        </details>
      ))}
    </section>
  );
}

/** "Overstap-kaart": trips with one change, for when no direct ride helps. */
function Transfers({ transfers, board, now }: { transfers: Transfer[]; board: Board; now: number }) {
  return (
    <section aria-label="Ritten met overstap" className="flex flex-col">
      <h2 className="pt-1 pb-2 text-body-s font-semibold text-tekst-zacht">Met 1 overstap</h2>
      <ul>
        {transfers.map((journey) => {
          const change = shortStop(journey.first.to.name, board.origin.name);
          const wait = journey.second.expectedDeparture - journey.first.expectedArrival;
          const leave = formatWait(journey.leaveAt, now);
          return (
            <li key={`${journey.first.tripId}-${journey.second.tripId}`} className="flex flex-col gap-1 border-t border-rand py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-m">
                <LineBadge line={journey.first.line} mode={journey.first.mode} />
                <span className="font-semibold tabular-nums">{formatClock(journey.first.expectedDeparture)}</span>
                <Icon name="arrowR" size={16} className="text-tekst-zacht" />
                <span className="font-semibold">{change}</span>
                <Icon name="arrowR" size={16} className="text-tekst-zacht" />
                <LineBadge line={journey.second.line} mode={journey.second.mode} />
                <span className="font-semibold tabular-nums">{formatClock(journey.second.expectedDeparture)}</span>
              </div>
              <p className="text-body-s text-tekst-zacht">
                {[
                  journey.walkToSeconds > 0
                    ? `${leave === "nu" ? "Nu" : leave.includes(":") ? `Om ${leave}` : `Over ${leave}`} gaan lopen (${minutes(journey.walkToSeconds)} min)`
                    : `Vertrekt ${leave === "nu" ? "nu" : leave.includes(":") ? `om ${leave}` : `over ${leave}`}`,
                  `${minutes(wait)} min overstappen${journey.changeWalkSeconds > 0 ? " (oversteken)" : ""}`,
                  `aan ${formatClock(journey.doorArrival)}`,
                ].join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BoardView({ board, now, onShowRoute }: { board: Board; now: number; onShowRoute?: ShowRoute }) {
  if (board.departures.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        <Alerts alerts={board.alerts} />
        {board.transfers.length > 0 ? (
          <Transfers transfers={board.transfers} board={board} now={now} />
        ) : (
          <div className="rounded-2xl bg-oppervlak p-4">
            <p className="text-body-m font-semibold">Geen rit in de komende 90 minuten</p>
            <p className="mt-1 text-body-s text-tekst-zacht">
              {board.walkIncluded
                ? "Ook met één overstap is er nu niets gevonden."
                : "Zet haltes op loopafstand aan, of kies een halte in de buurt."}
            </p>
          </div>
        )}
      </div>
    );
  }

  const { pick, then, groups } = overview(board.departures, board.origin.name);
  const useful = groups.filter((group) => group.best);
  const slower = groups.filter((group) => !group.best);

  return (
    <section aria-label={`Vertrekken van ${board.origin.name} naar ${board.destination.name}`} className="flex flex-col gap-3.5">
      {pick ? (
        <PickCard pick={pick} then={then} board={board} now={now} onShowRoute={onShowRoute} />
      ) : (
        <p className="rounded-[14px] border border-waarschuwing-rand bg-waarschuwing-bg p-4 text-body-s text-waarschuwing">
          Geen rit meer die je nu nog haalt. Hieronder staan de latere vertrekken.
        </p>
      )}
      <Alerts alerts={board.alerts} />
      {board.transfers.length > 0 && <Transfers transfers={board.transfers} board={board} now={now} />}
      <div className="flex flex-col">
        <div className="flex items-center justify-between pt-1 pb-2 text-body-s text-tekst-zacht">
          <h2 className="font-semibold">Alle lijnen hierheen</h2>
          {board.summary.headwayMinutes !== null && <span>samen elke ~{board.summary.headwayMinutes} min</span>}
        </div>
        <ul>
          {useful.map((group) => (
            <GroupRow key={group.key} group={group} board={board} now={now} onShowRoute={onShowRoute} />
          ))}
        </ul>
        {slower.length > 0 && (
          <details className="group/slow">
            <summary className="flex h-12 cursor-pointer list-none items-center gap-2 border-t border-rand [&::-webkit-details-marker]:hidden">
              <span className="text-body-m font-semibold text-tekst-zacht">
                Toon {slower.length} {slower.length === 1 ? "tragere lijn" : "tragere lijnen"}
              </span>
              {slower.slice(0, 4).map((group) => (
                <LineBadge key={group.key} line={group.line} mode={group.mode} />
              ))}
              <Icon name="chevD" size={20} className="ml-auto text-tekst-zacht transition-transform group-open/slow:rotate-180" />
            </summary>
            <ul>
              {slower.map((group) => (
                <GroupRow key={group.key} group={group} board={board} now={now} onShowRoute={onShowRoute} />
              ))}
            </ul>
          </details>
        )}
        <p className="border-t border-rand pt-2.5 text-body-s text-tekst-zacht">
          Tik op een lijn voor alle ritten · {REALTIME_NOTE[board.realtime]} · bijgewerkt {formatClock(board.generatedAt)}
        </p>
      </div>
    </section>
  );
}
