"use client";

import { useId, useState, type FormEvent } from "react";
import {
  DAY_SHORT,
  routeName,
  sameRoute,
  scheduleLabel,
  WEEK,
  type RouteSchedule,
  type SavedRoute,
} from "@/lib/saved-routes";
import type { StopOption } from "./StopPicker";
import { Icon } from "./Icon";
import { useSavedRoutes } from "./useSavedRoutes";

/** "Knop · Secundair": soft grey, blue label. */
const BUTTON =
  "flex h-12 items-center justify-center gap-2 rounded-xl bg-oppervlak px-[18px] text-body-m font-semibold text-accent hover:bg-rand disabled:opacity-50";
const INPUT = "h-11 rounded-lg border border-rand bg-achtergrond px-3 text-body-m";
const WEEKDAYS = [1, 2, 3, 4, 5];

/** The routes kept in this browser; one click opens the board again. */
export function SavedRouteList({
  fromId,
  toId,
  onOpen,
}: {
  fromId: string | null;
  toId: string | null;
  onOpen: (route: SavedRoute) => void;
}) {
  const { routes, remove } = useSavedRoutes();
  if (routes.length === 0) return null;

  return (
    <section aria-label="Mijn routes" className="flex flex-col gap-2">
      <h2 className="text-body-s text-tekst-zacht">Mijn routes</h2>
      <ul className="flex flex-wrap gap-2">
        {routes.map((route) => {
          const active = sameRoute(route, fromId, toId);
          return (
            <li
              key={route.id}
              className={`flex max-w-full items-center overflow-hidden rounded-[10px] border text-body-s ${
                active ? "border-donker bg-donker text-op-donker" : "border-rand bg-achtergrond text-tekst"
              }`}
            >
              <button
                type="button"
                onClick={() => onOpen(route)}
                aria-current={active ? "true" : undefined}
                title={`${route.from.name} → ${route.to.name}`}
                className="min-h-11 min-w-0 px-3 py-1.5 text-left"
              >
                <span className="block truncate font-semibold">{route.name}</span>
                {route.schedule && <span className="block truncate">{scheduleLabel(route.schedule)}</span>}
              </button>
              <button
                type="button"
                onClick={() => void remove(route.id)}
                aria-label={`Verwijder ${route.name}`}
                className="flex h-11 w-9 shrink-0 items-center justify-center"
              >
                <Icon name="x" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A sensible first window: the coming hour and a half on weekdays, starting on a quarter. */
function defaultSchedule(now = new Date()): RouteSchedule {
  const start = Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
  const end = Math.min(start + 90, 23 * 60 + 59);
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { days: WEEKDAYS, start: clock(start), end: clock(end) };
}

/** Saves the current pair of places, map points included, with a name and an optional fixed time. */
export function SaveRouteButton({ from, to, walk }: { from: StopOption | null; to: StopOption | null; walk: boolean }) {
  const { routes, save } = useSavedRoutes();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState<RouteSchedule | null>(null);
  const [failed, setFailed] = useState(false);

  if (!from || !to) return null;
  const saved = routes.find((route) => sameRoute(route, from.id, to.id));
  const suggestion = routeName("", from, to);
  const scheduleInvalid = schedule !== null && (schedule.days.length === 0 || schedule.start === schedule.end);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (scheduleInvalid) return;
    const ok = await save({
      id: saved?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: routeName(name, from, to),
      from: { id: from.id, name: from.name },
      to: { id: to.id, name: to.name },
      walk,
      savedAt: Date.now(),
      schedule,
    });
    setFailed(!ok);
    if (ok) setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setName(saved?.name ?? "");
            setSchedule(saved?.schedule ?? null);
            setEditing(true);
          }}
          className={`${BUTTON} shrink-0`}
        >
          <Icon name={saved ? "edit" : "star"} size={20} />
          {saved ? "Route bewerken" : "Route bewaren"}
        </button>
        {saved && (
          <span className="text-body-s text-tekst-zacht">
            Bewaard als “{saved.name}”{saved.schedule ? `, opent vanzelf ${scheduleLabel(saved.schedule)}` : ""}
          </span>
        )}
      </div>
    );
  }

  const toggleDay = (day: number) =>
    setSchedule((current) =>
      current
        ? {
            ...current,
            days: current.days.includes(day) ? current.days.filter((d) => d !== day) : [...current.days, day].sort(),
          }
        : current,
    );

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 rounded-2xl border border-rand p-4">
      <div className="space-y-1">
        <label htmlFor={`${id}-name`} className="block text-body-s text-tekst-zacht">
          Naam van de route
        </label>
        <input
          id={`${id}-name`}
          name="route-name"
          autoFocus
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={suggestion}
          className={`${INPUT} w-full`}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">Vaste reis</legend>
        <label className="flex min-h-11 items-center gap-2 text-body-m font-semibold">
          <input
            type="checkbox"
            name="scheduled"
            checked={schedule !== null}
            onChange={(event) => setSchedule(event.target.checked ? (saved?.schedule ?? defaultSchedule()) : null)}
            className="size-4"
          />
          Vaste reis: opent vanzelf op deze tijden
        </label>
        {schedule && (
          <div className="space-y-2 pl-6">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Dagen">
              {WEEK.map((day) => {
                const on = schedule.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(day)}
                    className={`h-11 w-11 rounded-full text-body-s font-semibold ${on ? "bg-donker text-op-donker" : "bg-oppervlak text-tekst"}`}
                  >
                    {DAY_SHORT[day]}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor={`${id}-start`} className="text-tekst-zacht">
                van
              </label>
              <input
                id={`${id}-start`}
                name="start"
                type="time"
                required
                value={schedule.start}
                onChange={(event) => setSchedule({ ...schedule, start: event.target.value })}
                className={INPUT}
              />
              <label htmlFor={`${id}-end`} className="text-tekst-zacht">
                tot
              </label>
              <input
                id={`${id}-end`}
                name="end"
                type="time"
                required
                value={schedule.end}
                onChange={(event) => setSchedule({ ...schedule, end: event.target.value })}
                className={INPUT}
              />
            </div>
            {scheduleInvalid && <p className="text-body-s text-fout">Kies minstens één dag en twee verschillende tijden.</p>}
            <p className="text-body-s text-tekst-zacht">Open je de app in dit tijdvak zonder route, dan staat deze route meteen klaar.</p>
          </div>
        )}
      </fieldset>

      {failed && <p className="text-body-s text-fout">Opslaan lukte niet. Probeer het opnieuw.</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={scheduleInvalid}
          className="flex h-12 flex-1 items-center justify-center rounded-xl bg-donker px-[18px] text-body-m font-semibold text-op-donker disabled:opacity-50"
        >
          Opslaan
        </button>
        <button type="button" onClick={() => setEditing(false)} className={`${BUTTON} flex-1`}>
          Annuleren
        </button>
      </div>
    </form>
  );
}
