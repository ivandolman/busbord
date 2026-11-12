import { describe, expect, it } from "vitest";
import { pickBestPairPerTrip, rankDepartures, summarise, walkSeconds, worthwhileRides } from "@/lib/board/build-board";
import type { Departure } from "@/lib/board/types";
import { parseCsvLine } from "@/lib/gtfs/csv";
import { clipShape, simplifyPath } from "@/lib/network/patterns";
import { parsePointId, pointId } from "@/lib/place";
import { overview } from "@/lib/board/group";
import { isScheduledAt, parseSavedRoutes, routeName, scheduledRoute, scheduleLabel, withRoute, type SavedRoute } from "@/lib/saved-routes";
import { stopNameKey } from "@/lib/stop-name";
import { matchAlerts } from "@/lib/board/alerts";
import { localServiceDate, parseGtfsTime, serviceDayStart, shiftServiceDate } from "@/lib/time";

const departure = (line: string, dep: number, arr: number, cancelled = false): Departure => ({
  tripId: `${line}-${dep}`,
  line,
  mode: "bus",
  headsign: "",
  from: { stopId: "a", name: "A", platform: "", lat: 52, lon: 5, walkMeters: 0 },
  to: { stopId: "b", name: "B", platform: "", lat: 52.01, lon: 5, walkMeters: 0 },
  plannedDeparture: dep,
  plannedArrival: arr,
  expectedDeparture: dep,
  expectedArrival: arr,
  cancelled,
  walkToSeconds: 0,
  walkFromSeconds: 0,
  leaveAt: dep,
  doorArrival: arr,
  catchable: true,
  overtakenBy: null,
  firstToArrive: false,
});

describe("parseCsvLine", () => {
  it("splits plain and quoted fields", () => {
    expect(parseCsvLine("a,b,,d")).toEqual(["a", "b", "", "d"]);
    expect(parseCsvLine('1,"Utrecht, CS Centrumzijde","say ""hi""",')).toEqual([
      "1",
      "Utrecht, CS Centrumzijde",
      'say "hi"',
      "",
    ]);
  });
});

describe("time", () => {
  it("parses GTFS times past midnight", () => {
    expect(parseGtfsTime("25:10:00")).toBe(90_600);
    expect(parseGtfsTime("")).toBeNull();
  });

  it("anchors the service day to local noon minus twelve hours", () => {
    // Ordinary winter day: local midnight, 23:00 UTC the evening before.
    expect(serviceDayStart("20261112")).toBe(Date.UTC(2026, 10, 11, 23) / 1000);
    // Clocks go back on 25 October 2026, so the anchor sits an hour after local midnight.
    expect(serviceDayStart("20261025")).toBe(Date.UTC(2026, 9, 24, 23) / 1000);
  });

  it("derives and shifts local dates", () => {
    expect(localServiceDate(Date.UTC(2026, 10, 12, 23, 30))).toBe("20261113");
    expect(shiftServiceDate("20270101", -1)).toBe("20261231");
  });
});

describe("rankDepartures", () => {
  it("counts the walk at both ends and skips buses you cannot walk to in time", () => {
    // 28 arrives first at its stop, but that stop is a 10-minute walk from where you want to be.
    const far = { ...departure("28", 120, 900), walkFromSeconds: 600, doorArrival: 1500 };
    const near = departure("20", 180, 1200);
    // 22 would be fastest, but it leaves before you can reach its stop.
    const missed = { ...departure("22", 60, 700), walkToSeconds: 300, leaveAt: -240, catchable: false };
    const ranked = rankDepartures([far, near, missed]);
    expect(ranked.find((d) => d.line === "28")?.overtakenBy).toBe("20");
    expect(ranked.find((d) => d.line === "20")?.firstToArrive).toBe(true);
    expect(ranked.find((d) => d.line === "22")?.firstToArrive).toBe(false);
    // 800 m of walking at 5 km/h is 9.6 minutes, shown as 10.
    expect(walkSeconds(800)).toBe(600);
  });

  it("flags a departure that a later one beats to the destination", () => {
    const ranked = rankDepartures([departure("28", 180, 1560), departure("20", 360, 1380), departure("22", 120, 1140)]);
    expect(ranked.map((d) => d.line)).toEqual(["22", "28", "20"]);
    expect(ranked.map((d) => d.overtakenBy)).toEqual([null, "20", null]);
    expect(ranked.map((d) => d.firstToArrive)).toEqual([true, false, false]);
  });

  it("ignores cancelled trips when deciding who overtakes whom", () => {
    const ranked = rankDepartures([departure("28", 180, 1560), departure("20", 360, 1380, true)]);
    expect(ranked[0]?.overtakenBy).toBeNull();
    expect(ranked[0]?.firstToArrive).toBe(true);
    expect(ranked[1]?.firstToArrive).toBe(false);
  });
});

describe("summarise", () => {
  it("reports the typical gap between useful departures", () => {
    const ranked = rankDepartures([0, 300, 600, 900, 1200].map((t) => departure("1", t, t + 600)));
    expect(summarise(ranked, 0)).toEqual({ lines: [{ line: "1", mode: "bus" }], headwayMinutes: 5 });
  });

  it("stays silent when there is too little to go on", () => {
    expect(summarise(rankDepartures([departure("1", 0, 600)]), 0).headwayMinutes).toBeNull();
  });
});

describe("map points", () => {
  it("round-trips and rejects anything else", () => {
    expect(parsePointId(pointId({ lat: 52.0853, lon: 5.1727 }))).toEqual({ lat: 52.0853, lon: 5.1727 });
    expect(parsePointId("@95,5")).toBeNull();
    expect(parsePointId("stoparea:1")).toBeNull();
    expect(parsePointId("@52.1,5.1;drop")).toBeNull();
  });
});

describe("shapes", () => {
  it("drops points on a straight line and cuts a shape to the stops we keep", () => {
    const straight: [number, number][] = [
      [52, 5],
      [52.001, 5],
      [52.002, 5],
      [52.003, 5.002],
    ];
    expect(simplifyPath(straight, 5)).toEqual([
      [52, 5],
      [52.002, 5],
      [52.003, 5.002],
    ]);
    const shape: [number, number][] = [
      [51.9, 5],
      [52, 5],
      [52.1, 5],
      [52.2, 5],
    ];
    expect(clipShape(shape, [52.001, 5], [52.099, 5])).toEqual([
      [52, 5],
      [52.1, 5],
    ]);
  });
});

describe("saved routes", () => {
  const route = (id: string, from: string, to: string): SavedRoute => ({
    id,
    name: id,
    from: { id: from, name: "A" },
    to: { id: to, name: "B" },
    walk: true,
    savedAt: 1,
    schedule: null,
  });

  it("keeps valid routes, map points included, and drops anything else", () => {
    const raw = JSON.stringify([
      route("home", "@52.08540,5.17240", "stoparea:1"),
      { id: "bad", name: "x", from: { id: "<script>" }, to: { id: "stoparea:2" } },
      "nonsense",
    ]);
    expect(parseSavedRoutes(raw).map((entry) => entry.id)).toEqual(["home"]);
    expect(parseSavedRoutes("{not json")).toEqual([]);
    expect(parseSavedRoutes(null)).toEqual([]);
  });

  it("replaces a saved trip instead of duplicating it and names unnamed routes", () => {
    const routes = withRoute([route("old", "stoparea:1", "stoparea:2")], route("new", "stoparea:1", "stoparea:2"));
    expect(routes.map((entry) => entry.id)).toEqual(["new"]);
    expect(routeName("  ", { id: "a", name: "Thuis" }, { id: "b", name: "Werk" })).toBe("Thuis → Werk");
  });
});

describe("board overview", () => {
  it("picks the first useful departure and lists each line and direction once", () => {
    const towards = (d: ReturnType<typeof departure>, headsign: string) => ({ ...d, headsign });
    const ranked = rankDepartures([
      towards(departure("28", 180, 1560), "Utrecht, Vleuterweide"),
      towards(departure("20", 360, 1380), "Nieuwegein"),
      towards(departure("22", 120, 1140), "Utrecht, P+R Science Park"),
      towards(departure("22", 720, 1740), "Utrecht, P+R Science Park"),
      towards(departure("28", 900, 2280), "Utrecht, Vleuterweide"),
    ]);
    const result = overview(ranked, "Utrecht, CS Centrumzijde");
    expect(result.pick?.line).toBe("22");
    expect(result.then.map((d) => d.line)).toEqual(["20", "22"]);
    expect(result.groups.map((g) => `${g.line} ${g.direction}`)).toEqual([
      "22 P+R Science Park",
      "20 Nieuwegein",
      "28 Vleuterweide",
    ]);
    // The first 28 is beaten by tram 20, so the group's best is the later 28 and it comes last.
    expect(result.groups[2]?.best?.tripId).toBe("28-900");
    expect(result.groups[0]?.departures).toHaveLength(2);
  });
});

describe("route schedules", () => {
  const at = (day: number, time: string) => {
    // 2 November 2026 is a Monday; day 0 = Sunday the 8th.
    const date = new Date(2026, 10, day === 0 ? 8 : 1 + day, Number(time.slice(0, 2)), Number(time.slice(3)));
    return date;
  };

  it("matches days and times, including windows past midnight", () => {
    const work = { days: [1, 2, 3, 4, 5], start: "07:30", end: "09:00" };
    expect(isScheduledAt(work, at(1, "08:15"))).toBe(true);
    expect(isScheduledAt(work, at(1, "09:01"))).toBe(false);
    expect(isScheduledAt(work, at(6, "08:15"))).toBe(false);

    const night = { days: [5], start: "23:00", end: "01:00" };
    expect(isScheduledAt(night, at(5, "23:30"))).toBe(true);
    expect(isScheduledAt(night, at(6, "00:30"))).toBe(true);
    expect(isScheduledAt(night, at(5, "00:30"))).toBe(false);
  });

  it("finds the route for now and labels schedules the Dutch way", () => {
    const route = (id: string, schedule: SavedRoute["schedule"]): SavedRoute => ({
      id,
      name: id,
      from: { id: "stoparea:1", name: "A" },
      to: { id: `stoparea:${id}`, name: "B" },
      walk: true,
      savedAt: 0,
      schedule,
    });
    const routes = [
      route("morning", { days: [1, 2, 3, 4, 5], start: "07:30", end: "09:00" }),
      route("afternoon", { days: [1, 2, 3, 4, 5], start: "16:30", end: "18:00" }),
    ];
    expect(scheduledRoute(routes, at(3, "17:00"))?.id).toBe("afternoon");
    expect(scheduledRoute(routes, at(3, "12:00"))).toBeNull();
    expect(scheduleLabel({ days: [1, 2, 3, 4, 5], start: "07:30", end: "09:00" })).toBe("ma–vr 07:30–09:00");
    expect(scheduleLabel({ days: [1, 3, 5], start: "16:30", end: "18:00" })).toBe("ma, wo, vr 16:30–18:00");
    expect(scheduleLabel({ days: [0, 1, 2, 3, 4, 5, 6], start: "08:00", end: "09:00" })).toBe("elke dag 08:00–09:00");
    // A stored schedule with nonsense in it is dropped, the route itself kept.
    const raw = JSON.stringify([{ ...route("x", null), schedule: { days: [9], start: "25:00", end: "x" } }]);
    expect(parseSavedRoutes(raw)[0]?.schedule).toBeNull();
  });
});

describe("pickBestPairPerTrip", () => {
  const stop = (toStopId: string, arrival: number) => ({
    tripId: "55-1",
    routeId: "55",
    serviceDate: "20261112",
    line: "55",
    mode: "bus" as const,
    headsign: "",
    fromStopId: "a",
    fromSeq: 1,
    toStopId,
    toSeq: toStopId === "near" ? 3 : 2,
    plannedDeparture: 0,
    plannedArrival: arrival,
  });

  it("prefers less walking when door-to-door times are within two minutes", () => {
    // Wittevrouwenbrug: 355 m (~5:20 walk). Kleinesingel: 2 min later, 238 m (~3:34): 14 s slower.
    const walk = new Map([["far", 355], ["near", 238]]);
    const [picked] = pickBestPairPerTrip([stop("far", 600), stop("near", 720)], new Map(), walk);
    expect(picked?.toStopId).toBe("near");
  });

  it("still takes the quicker stop when the difference is two minutes or more", () => {
    const walk = new Map([["far", 355], ["near", 238]]);
    const [picked] = pickBestPairPerTrip([stop("far", 600), stop("near", 840)], new Map(), walk);
    expect(picked?.toStopId).toBe("far");
  });

  it("follows the chosen tie: 0 is always the quickest, a larger one walks less", () => {
    const walk = new Map([["far", 355], ["near", 238]]);
    const candidates = [stop("far", 600), stop("near", 720)];
    expect(pickBestPairPerTrip(candidates, new Map(), walk, 0)[0]?.toStopId).toBe("far");
    expect(pickBestPairPerTrip([stop("far", 600), stop("near", 840)], new Map(), walk, 5 * 60)[0]?.toStopId).toBe("near");
  });
});

describe("worthwhileRides", () => {
  it("drops a ring line going the long way round but keeps reasonable alternatives", () => {
    const trip = (routeId: string, dep: number, minutes: number, toStopId = "b") => ({
      tripId: `${routeId}-${dep}`,
      routeId,
      serviceDate: "20261112",
      line: routeId,
      mode: "bus" as const,
      headsign: "",
      fromStopId: "a",
      fromSeq: 1,
      toStopId,
      toSeq: 2,
      plannedDeparture: dep,
      plannedArrival: dep + minutes * 60,
    });
    const kept = worthwhileRides([
      trip("direct", 0, 7),
      trip("direct", 600, 8),
      trip("slower", 0, 14),
      trip("ring", 0, 31),
      // Getting off at a stop a 1,100 m walk away (13 minutes) makes this one too slow as well.
      trip("far", 0, 5, "c"),
    ], new Map(), new Map([["c", 1100]]));
    expect([...new Set(kept.map((t) => t.routeId))]).toEqual(["direct", "slower"]);
  });
});

describe("stopNameKey", () => {
  it("treats different spellings of one stop as the same name", () => {
    expect(stopNameKey("Utrecht, Kleinesingel")).toBe(stopNameKey("Utrecht, Kleine Singel"));
    expect(stopNameKey("Utrecht, Café-Plein")).toBe(stopNameKey("utrecht cafe plein"));
    expect(stopNameKey("Utrecht, Janskerkhof")).not.toBe(stopNameKey("Utrecht, Stadsschouwburg"));
  });
});

describe("matchAlerts", () => {
  const alert = (id: string, entities: { routeId: string | null; stopId: string | null }[], header = id) => ({
    id,
    header,
    description: "",
    periods: [{ start: 0, end: 2000 }],
    entities,
  });

  it("keeps alerts about our lines or our stops, active now, once per text", () => {
    const alerts = [
      alert("line", [{ routeId: "r1", stopId: null }]),
      alert("line at our stop", [{ routeId: "r1", stopId: "s1" }]),
      alert("line at another stop", [{ routeId: "r1", stopId: "s9" }]),
      alert("our stop", [{ routeId: null, stopId: "s1" }]),
      alert("other line", [{ routeId: "r2", stopId: null }]),
      alert("again", [{ routeId: "r1", stopId: null }], "line"),
      { ...alert("over", [{ routeId: "r1", stopId: null }]), periods: [{ start: 0, end: 500 }] },
    ];
    const ids = matchAlerts(alerts, new Set(["r1"]), new Set(["s1"]), 1000).map((a) => a.id);
    expect(ids).toEqual(["line", "line at our stop", "our stop"]);
  });
});
