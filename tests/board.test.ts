import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeTripUpdates, type RealtimeSource } from "@/lib/board/realtime";
import { TimetableRepository } from "@/lib/board/repository";
import { getNextDepartures } from "@/lib/board/next-departures";
import { getBoard, getStopBoard, UnknownAreaError } from "@/lib/board/service";
import type { Mode } from "@/lib/board/types";
import { parseBoundingBox } from "@/lib/config";
import { writeDemoFeed } from "@/lib/gtfs/demo-feed";
import { importGtfs } from "@/lib/gtfs/importer";
import { buildNetwork } from "@/lib/network/network";
import { rideSegments } from "@/lib/network/segments";

const CS_CENTRUM = "stoparea:cs-centrum";
const CS_JAARBEURS = "stoparea:cs-jaarbeurs";
const HEIDELBERGLAAN = "stoparea:heidelberglaan";
const DE_BILT = "stoparea:de-bilt";
const NIEUWEGEIN = "stoparea:nieuwegein";
const MODES: ReadonlySet<Mode> = new Set<Mode>(["bus", "tram"]);

// 12 November 2026, 14:00 in Utrecht (CET, UTC+1).
const AFTERNOON = new Date(Date.UTC(2026, 10, 12, 13, 0));

let directory: string;
let db: DatabaseSync;
let repository: TimetableRepository;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "bestemmingsbord-"));
  const zipPath = join(directory, "feed.zip");
  const dbPath = join(directory, "gtfs.sqlite");
  await writeDemoFeed(zipPath, "20261111", 3);
  await importGtfs({ zipPath, dbPath, bbox: parseBoundingBox(undefined), source: "test" });
  db = new DatabaseSync(dbPath, { readOnly: true });
  repository = new TimetableRepository(db);
});

afterAll(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

const board = (originId: string, destinationId: string, now = AFTERNOON, realtime: RealtimeSource | null = null, includeWalking = false) =>
  getBoard(repository, realtime, { originId, destinationId, includeWalking, modes: MODES, now });

describe("stop search", () => {
  it("matches every word, ignores punctuation and ranks busy stops first", () => {
    expect(repository.searchAreas("utrecht cs", 5).map((area) => area.name)).toEqual([
      "Utrecht, CS Centrumzijde",
      "Utrecht, CS Jaarbeurszijde",
    ]);
    expect(repository.searchAreas("100%_", 5)).toEqual([]);
  });
});

describe("getBoard", () => {
  it("bundles every line that links the two stops", async () => {
    const result = await board(CS_CENTRUM, HEIDELBERGLAAN);
    expect(result.summary.lines.map((entry) => entry.line).sort()).toEqual(["20", "22", "28"]);
    expect(result.realtime).toBe("disabled");
    expect(result.departures.every((d) => d.expectedDeparture >= result.generatedAt - 30)).toBe(true);
    expect(result.departures.every((d) => d.expectedArrival > d.expectedDeparture)).toBe(true);
  });

  it("shows platforms and flags the slow bus that trams overtake", async () => {
    const result = await board(CS_CENTRUM, HEIDELBERGLAAN);
    const buses = result.departures.filter((d) => d.line === "28");
    expect(buses.length).toBeGreaterThan(0);
    expect(buses.every((d) => d.from.platform === "B2")).toBe(true);
    expect(buses.some((d) => d.overtakenBy === "20" || d.overtakenBy === "22")).toBe(true);
    expect(result.departures.filter((d) => d.firstToArrive)).toHaveLength(1);
  });

  it("only looks in the requested direction", async () => {
    const result = await board(DE_BILT, CS_CENTRUM);
    expect(result.summary.lines.map((entry) => entry.line).sort()).toEqual(["73", "77"]);
    expect(result.departures.every((d) => d.to.name === "Utrecht, CS Centrumzijde")).toBe(true);
  });

  it("adds platforms within walking distance only when asked", async () => {
    const without = await board(CS_JAARBEURS, HEIDELBERGLAAN);
    expect(without.summary.lines.map((entry) => entry.line)).not.toContain("22");
    const withWalking = await board(CS_JAARBEURS, HEIDELBERGLAAN, AFTERNOON, null, true);
    expect(withWalking.summary.lines.map((entry) => entry.line)).toContain("22");
  });

  it("boards at the chosen stop, not a nearby one further down the line", async () => {
    // Line 20 calls at CS Jaarbeurszijde and then CS Centrumzijde, which is within walking distance.
    const result = await board(CS_JAARBEURS, HEIDELBERGLAAN, AFTERNOON, null, true);
    const tram20 = result.departures.filter((d) => d.line === "20");
    expect(tram20.length).toBeGreaterThan(0);
    expect(tram20.every((d) => d.from.name === "Utrecht, CS Jaarbeurszijde" && d.from.walkMeters === 0)).toBe(true);
    const tram22 = result.departures.filter((d) => d.line === "22");
    expect(tram22.every((d) => d.from.walkMeters > 0)).toBe(true);
  });

  it("keeps the destination's own platforms when they lie within the origin's walking radius", async () => {
    const result = await board(CS_CENTRUM, CS_JAARBEURS, AFTERNOON, null, true);
    expect(result.summary.lines.map((entry) => entry.line)).toContain("28");
    expect(result.departures.every((d) => d.to.walkMeters === 0)).toBe(true);
  });

  it("starts from a point on the map using the stops around it", async () => {
    const result = await board("@52.08540,5.17240", CS_CENTRUM);
    expect(result.origin.kind).toBe("point");
    expect(result.origin.name).toBe("Bij Utrecht, Heidelberglaan");
    expect(result.departures.length).toBeGreaterThan(0);
    expect(result.departures.every((d) => d.from.walkMeters > 0 && d.from.walkMeters <= 400)).toBe(true);
  });

  it("keeps serving yesterday's trips after midnight", async () => {
    // 00:20 local on 13 November: demo trips that left the terminus at "24:xx" are still running.
    const result = await board(CS_CENTRUM, HEIDELBERGLAAN, new Date(Date.UTC(2026, 10, 12, 23, 20)));
    expect(result.departures.length).toBeGreaterThan(0);
  });

  it("rejects unknown stops", async () => {
    await expect(board("stoparea:nope", CS_CENTRUM)).rejects.toBeInstanceOf(UnknownAreaError);
  });
});

describe("stop board", () => {
  it("lists every line leaving a stop and marks the ones that reach the destination", async () => {
    const result = await getStopBoard(repository, null, {
      stopId: CS_CENTRUM,
      destinationId: HEIDELBERGLAAN,
      includeWalking: false,
      modes: MODES,
      now: AFTERNOON,
      horizonSeconds: 3600,
      limit: 100,
    });
    const lines = new Set(result.departures.map((d) => d.line));
    expect(lines).toEqual(new Set(["18", "20", "22", "28", "73", "77"]));
    const reaching = new Set(result.departures.filter((d) => d.toDestination).map((d) => d.line));
    expect(reaching).toEqual(new Set(["20", "22", "28"]));
    const times = result.departures.map((d) => d.expectedDeparture);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("says which pole each departure leaves from and how far it is from the origin", async () => {
    const result = await getStopBoard(repository, null, {
      stopId: CS_CENTRUM,
      destinationId: null,
      includeWalking: false,
      modes: MODES,
      now: AFTERNOON,
      horizonSeconds: 3600,
      limit: 100,
      originId: CS_JAARBEURS,
    });
    expect(result.poles.length).toBeGreaterThan(0);
    const poleIds = new Set(result.poles.map((pole) => pole.id));
    expect(result.departures.every((d) => poleIds.has(d.poleId))).toBe(true);
    expect(new Set(result.poles.map((pole) => pole.label)).size).toBe(result.poles.length);
    // Without a walker: the straight line plus a quarter, in walking time too.
    for (const pole of result.poles) {
      expect(pole.walkMeters).toBeGreaterThan(0);
      expect(pole.walkSeconds).toBe(Math.round((pole.walkMeters ?? 0) * 0.72));
    }
  });
});

describe("transfers", () => {
  it("offers a change at CS when there is no direct ride", async () => {
    const result = await board(DE_BILT, HEIDELBERGLAAN);
    expect(result.departures.filter((d) => d.catchable && !d.cancelled)).toEqual([]);
    expect(result.transfers.length).toBeGreaterThan(0);
    for (const journey of result.transfers) {
      expect(["73", "77"]).toContain(journey.first.line);
      expect(["20", "22", "28"]).toContain(journey.second.line);
      expect(journey.second.expectedDeparture).toBeGreaterThanOrEqual(journey.first.expectedArrival + 120);
      expect(journey.doorArrival).toBeGreaterThan(journey.leaveAt);
    }
    const leave = result.transfers.map((j) => j.leaveAt);
    expect(leave).toEqual([...leave].sort((a, b) => a - b));
  });

  it("does not search for changes when a direct ride works", async () => {
    expect((await board(CS_CENTRUM, HEIDELBERGLAAN)).transfers).toEqual([]);
  });
});

describe("next departures for map labels", () => {
  it("gives each stop only the lines that go to the destination, soonest ride per line", async () => {
    const result = await getNextDepartures(repository, null, {
      areaIds: [CS_CENTRUM, DE_BILT],
      destinationId: HEIDELBERGLAAN,
      includeWalking: false,
      modes: MODES,
      now: AFTERNOON,
      horizonSeconds: 3600,
    });
    const atCs = result.areas[CS_CENTRUM] ?? [];
    expect(new Set(atCs.map((d) => d.line))).toEqual(new Set(["20", "22", "28"]));
    expect(atCs.map((d) => d.expectedDeparture)).toEqual([...atCs.map((d) => d.expectedDeparture)].sort((a, b) => a - b));
    // De Bilt has no direct ride to Heidelberglaan.
    expect(result.areas[DE_BILT]).toEqual([]);
  });
});

describe("network", () => {
  it("draws every bus and tram line and knows which lines serve each stop", () => {
    const network = buildNetwork(db);
    expect(network.shaped).toBe(false);
    const lines = network.lines.map((line) => line.line);
    expect(lines).toEqual(expect.arrayContaining(["20", "22", "28", "73", "77"]));
    expect(network.lines.every((line) => line.paths.length > 0)).toBe(true);
    const heidelberglaan = network.stops.find((stop) => stop.id === HEIDELBERGLAAN);
    const served = heidelberglaan?.lines.map((index) => network.lines[index]?.line).sort();
    expect(served).toEqual(expect.arrayContaining(["20", "22", "28"]));
    // Every stop area is drawn exactly once, inside one merged stop named after its first area.
    const areaIds = network.stops.flatMap((stop) => stop.areaIds);
    expect(new Set(areaIds).size).toBe(areaIds.length);
    expect(network.stops.every((stop) => stop.areaIds[0] === stop.id)).toBe(true);
  });

  it("lists what is reachable without changing", () => {
    const stops = repository.stopIdsInAreas([DE_BILT]);
    const areas = new Set(repository.reachableFrom(stops, "20261112").map((row) => row.areaId));
    expect(areas.has(CS_CENTRUM)).toBe(true);
    expect(areas.has(NIEUWEGEIN)).toBe(true);
    expect(areas.has(HEIDELBERGLAAN)).toBe(false);
  });

  it("lists where a destination is reached from, and which lines link two stops in that direction", () => {
    const routeLine = (routeId: string) => buildNetwork(db).lines.find((line) => line.id === routeId)?.line;
    const toDeBilt = repository.reachingTo(repository.stopIdsInAreas([DE_BILT]), "20261112");
    expect(new Set(toDeBilt.map((row) => row.areaId)).has(CS_CENTRUM)).toBe(true);
    expect(new Set(toDeBilt.map((row) => routeLine(row.routeId)))).toEqual(new Set(["73", "77"]));

    // CS to Heidelberglaan: lines 20, 22 and 28, each only between boarding and getting off.
    const pairs = repository
      .findCandidates(repository.stopIdsInAreas([CS_CENTRUM]), repository.stopIdsInAreas([HEIDELBERGLAAN]), "20261112", 0, 4e9)
      .map((candidate) => ({ routeId: candidate.routeId, fromStopId: candidate.fromStopId, toStopId: candidate.toStopId }));
    const segments = rideSegments(db, pairs);
    expect(new Set(segments.map((segment) => routeLine(segment.routeId)))).toEqual(new Set(["20", "22", "28"]));
    const tram20 = segments.find((segment) => routeLine(segment.routeId) === "20");
    // Line 20 starts in Nieuwegein, but the ride starts at CS and ends at Heidelberglaan, not P+R Science Park.
    expect(tram20?.areaIds).toEqual([CS_CENTRUM, "stoparea:galgenwaard", HEIDELBERGLAAN]);
    expect(tram20?.path[0]).toEqual([52.0905, 5.1128]);
  });
});

describe("realtime", () => {
  it("applies delays and cancellations from a GTFS-realtime feed", async () => {
    const planned = await board(CS_CENTRUM, HEIDELBERGLAAN);
    const [delayed, cancelled] = planned.departures.filter((d) => d.line === "22");
    if (!delayed || !cancelled) throw new Error("expected two tram departures in the fixture");

    const { transit_realtime: rt } = GtfsRealtimeBindings;
    const bytes = rt.FeedMessage.encode(
      rt.FeedMessage.create({
        header: { gtfsRealtimeVersion: "2.0", timestamp: Math.floor(AFTERNOON.getTime() / 1000) },
        entity: [
          {
            id: "1",
            tripUpdate: {
              trip: { tripId: delayed.tripId, startDate: "20261112" },
              // Line 22 leaves CS at stop_sequence 1; the delay must carry to Heidelberglaan (3).
              stopTimeUpdate: [{ stopSequence: 1, departure: { delay: 240 } }],
            },
          },
          {
            id: "2",
            tripUpdate: {
              trip: {
                tripId: cancelled.tripId,
                startDate: "20261112",
                scheduleRelationship: rt.TripDescriptor.ScheduleRelationship.CANCELED,
              },
            },
          },
        ],
      }),
    ).finish();

    const snapshot = decodeTripUpdates(bytes);
    const live = await board(CS_CENTRUM, HEIDELBERGLAAN, AFTERNOON, { snapshot: async () => snapshot });
    expect(live.realtime).toBe("live");

    const delayedNow = live.departures.find((d) => d.tripId === delayed.tripId);
    expect(delayedNow?.expectedDeparture).toBe(delayed.plannedDeparture + 240);
    expect(delayedNow?.expectedArrival).toBe(delayed.plannedArrival + 240);

    const cancelledNow = live.departures.find((d) => d.tripId === cancelled.tripId);
    expect(cancelledNow?.cancelled).toBe(true);
    expect(cancelledNow?.firstToArrive).toBe(false);
  });

  it("falls back to the timetable when the feed is down", async () => {
    const result = await board(CS_CENTRUM, HEIDELBERGLAAN, AFTERNOON, { snapshot: async () => null });
    expect(result.realtime).toBe("unavailable");
    expect(result.departures.length).toBeGreaterThan(0);
  });
});
