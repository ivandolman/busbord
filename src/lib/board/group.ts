import type { Departure, Mode } from "./types";

/** "Utrecht, P+R Science Park" reads as "P+R Science Park" when you are already in Utrecht. */
export function shortHeadsign(headsign: string, originName: string): string {
  const [place, ...rest] = headsign.split(", ");
  const origin = originName.replace(/^Bij /, "");
  return rest.length > 0 && origin.startsWith(`${place}, `) ? rest.join(", ") : headsign;
}

/** A departure worth taking: it runs, you can walk to it in time, and nothing later beats it. */
export const isUseful = (departure: Departure) =>
  !departure.cancelled && departure.catchable && departure.overtakenBy === null;

/** All departures of one line in one direction, as one row on the board. */
export interface DepartureGroup {
  key: string;
  line: string;
  mode: Mode;
  /** Short headsign, e.g. "Vleuterweide". */
  direction: string;
  /** In departure order. */
  departures: Departure[];
  /** The first useful departure of the group, or null when every one is beaten by another line. */
  best: Departure | null;
}

export interface BoardOverview {
  /**
   * The departure to take: the one that gets you there first. Useful departures never leave
   * earlier yet arrive later than another, so this is also the soonest you need to act on; on a
   * tie in arrival the later one wins (more time, often less walking).
   */
  pick: Departure | null;
  /** Useful departures you set off for after the pick, any line. */
  then: Departure[];
  /** Useful groups first (by when you leave), then the ones that are always beaten. */
  groups: DepartureGroup[];
}

/**
 * Turns the ranked list into what a traveller in a hurry needs: one clear pick, a couple of
 * fallbacks, and every line-and-direction once with its next times.
 */
export function overview(departures: Departure[], originName: string, alternatives = 2): BoardOverview {
  const useful = departures.filter(isUseful).sort((a, b) => a.leaveAt - b.leaveAt);
  let pick: Departure | null = null;
  for (const departure of useful) {
    if (!pick || departure.doorArrival < pick.doorArrival || (departure.doorArrival === pick.doorArrival && departure.leaveAt > pick.leaveAt)) {
      pick = departure;
    }
  }

  const byKey = new Map<string, DepartureGroup>();
  for (const departure of departures) {
    const direction = departure.headsign ? shortHeadsign(departure.headsign, originName) : "";
    const key = `${departure.mode}|${departure.line}|${direction}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, line: departure.line, mode: departure.mode, direction, departures: [], best: null };
      byKey.set(key, group);
    }
    group.departures.push(departure);
    if (!group.best && isUseful(departure)) group.best = departure;
  }

  const groups = [...byKey.values()].sort((a, b) => {
    if (a.best && b.best) return a.best.leaveAt - b.best.leaveAt;
    if (a.best) return -1;
    if (b.best) return 1;
    return (a.departures[0]?.expectedDeparture ?? 0) - (b.departures[0]?.expectedDeparture ?? 0);
  });

  const then = pick ? useful.filter((departure) => departure.leaveAt > (pick as Departure).leaveAt) : [];
  return { pick, then: then.slice(0, alternatives), groups };
}
