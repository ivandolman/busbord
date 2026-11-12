import type { Mode } from "./types";

const clock = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });

export const formatClock = (epochSeconds: number) => clock.format(new Date(epochSeconds * 1000));

/** "nu", "4 min", or a clock time once the wait reaches an hour. */
export function formatWait(epochSeconds: number, nowSeconds: number): string {
  const minutes = Math.floor((epochSeconds - nowSeconds) / 60);
  if (minutes < 1) return "nu";
  if (minutes >= 60) return formatClock(epochSeconds);
  return `${minutes} min`;
}

export const delayMinutes = (planned: number, expected: number) => Math.round((expected - planned) / 60);

export const MODE_LABEL: Record<Mode, string> = {
  tram: "Tram",
  bus: "Bus",
  metro: "Metro",
  train: "Trein",
  ferry: "Veer",
  other: "Rit",
};
