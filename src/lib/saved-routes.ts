import { isPlaceId } from "./place";

/**
 * Routes the user keeps, stored on the server in SQLite (src/lib/user-data.ts). Endpoints are stop
 * areas or points picked on the map, exactly as in the URL, so a saved route opens the same board.
 */
export interface SavedPlace {
  id: string;
  name: string;
}

/**
 * When a route is a regular trip (to work in the morning, home in the afternoon). Opening the app
 * without a route inside this window opens it straight away. Times are local "HH:MM"; an end
 * before the start runs past midnight.
 */
export interface RouteSchedule {
  /** 0 = Sunday … 6 = Saturday, as Date.getDay(). */
  days: number[];
  start: string;
  end: string;
}

export interface SavedRoute {
  id: string;
  name: string;
  from: SavedPlace;
  to: SavedPlace;
  walk: boolean;
  savedAt: number;
  schedule: RouteSchedule | null;
}

/** Where earlier versions kept routes in the browser; read once to move them to the server. */
export const STORAGE_KEY = "bestemmingsbord:routes:v1";
export const MAX_ROUTES = 50;
const MAX_NAME = 60;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseSchedule(value: unknown): RouteSchedule | null {
  if (!isRecord(value) || !Array.isArray(value.days)) return null;
  const days = [...new Set(value.days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
  if (days.length === 0 || typeof value.start !== "string" || typeof value.end !== "string") return null;
  if (!TIME_PATTERN.test(value.start) || !TIME_PATTERN.test(value.end) || value.start === value.end) return null;
  return { days, start: value.start, end: value.end };
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Whether a moment falls inside the schedule. Past midnight, the day is the one the window started on. */
export function isScheduledAt(schedule: RouteSchedule, date: Date): boolean {
  const minute = date.getHours() * 60 + date.getMinutes();
  const start = toMinutes(schedule.start);
  const end = toMinutes(schedule.end);
  const day = date.getDay();
  if (start < end) return schedule.days.includes(day) && minute >= start && minute <= end;
  if (minute >= start) return schedule.days.includes(day);
  return minute <= end && schedule.days.includes((day + 6) % 7);
}

/** The first saved route whose schedule covers this moment. */
export function scheduledRoute(routes: SavedRoute[], date: Date): SavedRoute | null {
  return routes.find((route) => route.schedule && isScheduledAt(route.schedule, date)) ?? null;
}

const DAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
/** Monday first, the way a Dutch week reads. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** "ma–vr 07:30–09:00", "ma, wo, vr 16:30–18:00", "elke dag 08:00–09:00". */
export function scheduleLabel(schedule: RouteSchedule): string {
  const ordered = WEEK.filter((day) => schedule.days.includes(day));
  let days: string;
  if (ordered.length === 7) days = "elke dag";
  else {
    const positions = ordered.map((day) => WEEK.indexOf(day));
    const consecutive = positions.every((position, i) => i === 0 || position === (positions[i - 1] ?? -2) + 1);
    days =
      consecutive && ordered.length >= 3
        ? `${DAY_SHORT[ordered[0] ?? 0]}–${DAY_SHORT[ordered[ordered.length - 1] ?? 0]}`
        : ordered.map((day) => DAY_SHORT[day]).join(", ");
  }
  return `${days} ${schedule.start}–${schedule.end}`;
}

export { DAY_SHORT };

function parsePlace(value: unknown): SavedPlace | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isPlaceId(value.id)) return null;
  const name = typeof value.name === "string" ? value.name.slice(0, MAX_NAME) : "";
  return { id: value.id, name };
}

/**
 * Reads whatever is in storage defensively: it may be from an older version, edited by hand or
 * written by another tab mid-way. Anything that does not look like a route is dropped.
 */
export function parseSavedRoutes(raw: string | null): SavedRoute[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  return parseRouteList(data);
}

/** Same as parseSavedRoutes, for data that is already parsed (a request body). */
export function parseRouteList(data: unknown): SavedRoute[] {
  if (!Array.isArray(data)) return [];
  const routes: SavedRoute[] = [];
  for (const entry of data.slice(0, MAX_ROUTES)) {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") continue;
    const from = parsePlace(entry.from);
    const to = parsePlace(entry.to);
    if (!from || !to) continue;
    routes.push({
      id: entry.id.slice(0, 40),
      name: entry.name.slice(0, MAX_NAME),
      from,
      to,
      walk: entry.walk !== false,
      savedAt: typeof entry.savedAt === "number" ? entry.savedAt : 0,
      schedule: parseSchedule(entry.schedule),
    });
  }
  return routes;
}

export function routeName(name: string, from: SavedPlace, to: SavedPlace): string {
  const trimmed = name.trim().slice(0, MAX_NAME);
  return trimmed || `${from.name || "Vertrek"} → ${to.name || "Bestemming"}`.slice(0, MAX_NAME);
}

export function sameRoute(route: SavedRoute, fromId: string | null, toId: string | null): boolean {
  return route.from.id === fromId && route.to.id === toId;
}

export function withRoute(routes: SavedRoute[], route: SavedRoute): SavedRoute[] {
  // Saving the same trip again replaces it (with its new name) instead of adding a duplicate.
  const others = routes.filter((existing) => existing.id !== route.id && !sameRoute(existing, route.from.id, route.to.id));
  return [route, ...others].slice(0, MAX_ROUTES);
}
