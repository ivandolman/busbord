import { describe, expect, it } from "vitest";
import { locateStops, locateStopsOnPath, slicePath } from "@/lib/roads/line-path";
import { classifyWay, EDGE_CLASSES, FOOT_CLASS, TRAM_CLASS, type RoadNetwork } from "@/lib/roads/network";
import { RoadRouter, type LatLon } from "@/lib/roads/router";

const RESIDENTIAL = EDGE_CLASSES.findIndex(([name]) => name === "residential");

/**
 * A 3x2 ladder, ~110 m between rungs:
 *   0 - 1 - 2      top street (two-way)
 *   |   |   |
 *   3 - 4 - 5      bottom street, one-way 5 → 3 (westbound only)
 * plus a tram track 6 - 7 alongside.
 */
function ladder(): RoadNetwork {
  const lat = [52.002, 52.002, 52.002, 52.001, 52.001, 52.001, 52.0005, 52.0005];
  const lon = [5.0, 5.0016, 5.0032, 5.0, 5.0016, 5.0032, 5.0, 5.0032];
  const edges: [number, number, number, number][] = [
    [0, 1, RESIDENTIAL, 0],
    [1, 2, RESIDENTIAL, 0],
    [0, 3, RESIDENTIAL, 0],
    [1, 4, RESIDENTIAL, 0],
    [2, 5, RESIDENTIAL, 0],
    [5, 4, RESIDENTIAL, 1],
    [4, 3, RESIDENTIAL, 1],
    [6, 7, TRAM_CLASS, 0],
  ];
  return {
    lat: Float64Array.from(lat),
    lon: Float64Array.from(lon),
    edgeFrom: Uint32Array.from(edges.map((edge) => edge[0])),
    edgeTo: Uint32Array.from(edges.map((edge) => edge[1])),
    edgeClass: Uint8Array.from(edges.map((edge) => edge[2])),
    edgeOneway: Uint8Array.from(edges.map((edge) => edge[3])),
  };
}

const passesThrough = (path: LatLon[], lat: number, lon: number) =>
  path.some(([y, x]) => Math.abs(y - lat) < 1e-7 && Math.abs(x - lon) < 1e-7);

describe("road router", () => {
  const router = new RoadRouter(ladder());

  it("drives along the one-way street only in its direction", () => {
    const westbound = router.route("road", [52.001, 5.003], [52.001, 5.0002]);
    expect(westbound).not.toBeNull();
    expect(westbound?.every(([y]) => y <= 52.0010001)).toBe(true);

    // Eastbound on the bottom street is not allowed, so the route climbs to the top street.
    const eastbound = router.route("road", [52.001, 5.0002], [52.001, 5.003]);
    expect(eastbound).not.toBeNull();
    expect(passesThrough(eastbound ?? [], 52.002, 5.0016)).toBe(true);
  });

  it("follows a hint when two roads are equally short", () => {
    const viaTop = router.route("road", [52.0015, 5.0], [52.0015, 5.0032], [
      [52.0015, 5.0],
      [52.002, 5.0],
      [52.002, 5.0032],
      [52.0015, 5.0032],
    ]);
    expect(passesThrough(viaTop ?? [], 52.002, 5.0016)).toBe(true);
  });

  it("keeps trams on the tracks and buses off them", () => {
    expect(router.route("tram", [52.0005, 5.0001], [52.0005, 5.003])).not.toBeNull();
    expect(router.route("tram", [52.002, 5.0], [52.002, 5.0032])).toBeNull();
  });

  it("gives up on points far from any road", () => {
    expect(router.route("road", [52.05, 5.0], [52.002, 5.0032])).toBeNull();
  });

  it("walks both ways along one-way streets, never along tram tracks, and takes footpaths", () => {
    // Bottom street is one-way westbound for traffic; on foot it is the direct way east.
    const [east] = router.walkDistances([52.001, 5.0], [[52.001, 5.0032]], 2000);
    expect(east).toBeGreaterThan(210);
    expect(east).toBeLessThan(230);
    // The far end of the tram track is only reachable by tram.
    expect(router.walkDistances([52.002, 5.0], [[52.0005, 5.0032]], 2000)[0]).toBeGreaterThan(55 + 220);
    // Beyond the limit: no answer.
    expect(router.walkDistances([52.001, 5.0], [[52.002, 5.0032]], 100)[0]).toBeNull();

    const withPath = ladder();
    const footpath: RoadNetwork = {
      ...withPath,
      edgeFrom: Uint32Array.from([...withPath.edgeFrom, 3]),
      edgeTo: Uint32Array.from([...withPath.edgeTo, 2]),
      edgeClass: Uint8Array.from([...withPath.edgeClass, FOOT_CLASS]),
      edgeOneway: Uint8Array.from([...withPath.edgeOneway, 0]),
    };
    const walking = new RoadRouter(footpath);
    // The diagonal path (3 → 2) is shorter than round the block…
    expect(walking.walkDistances([52.001, 5.0], [[52.002, 5.0032]], 2000)[0]).toBeLessThan(250);
    // The walking area reaches along the streets, but not beyond the budget.
    const area = router.walkArea([52.001, 5.0], 150);
    expect(area?.length).toBeGreaterThanOrEqual(3);
    const furthest = Math.max(...(area ?? []).map(([y, x]) => Math.hypot((y - 52.001) * 111_320, (x - 5.0) * 111_320 * 0.6157)));
    expect(furthest).toBeGreaterThan(100);
    expect(furthest).toBeLessThanOrEqual(151);
    expect(router.walkArea([52.05, 5.0], 150)).toBeNull();
    // …but buses never use it.
    const drive = walking.route("road", [52.001, 5.0], [52.002, 5.0032]);
    expect(passesThrough(drive ?? [], 52.002, 5.0)).toBe(true);
  });
});

describe("classifyWay", () => {
  const tags = (entries: Record<string, string>) => new Map(Object.entries(entries));

  it("keeps bus lanes and tram tracks, keeps footpaths for walking, drops private roads", () => {
    expect(classifyWay(tags({ highway: "busway" }))).not.toBeNull();
    expect(classifyWay(tags({ highway: "service", access: "no", bus: "designated" }))).not.toBeNull();
    expect(classifyWay(tags({ railway: "tram" }))?.roadClass).toBe(TRAM_CLASS);
    // Footpaths are kept for walking only (the bus graph leaves them out).
    expect(classifyWay(tags({ highway: "footway" }))?.roadClass).toBe(FOOT_CLASS);
    expect(classifyWay(tags({ highway: "footway", access: "private" }))).toBeNull();
    expect(classifyWay(tags({ highway: "cycleway", foot: "no" }))).toBeNull();
    expect(classifyWay(tags({ highway: "residential", access: "private" }))).toBeNull();
    expect(classifyWay(tags({ highway: "service", service: "parking_aisle" }))).toBeNull();
  });

  it("reads one-way rules, including buses that may ignore them", () => {
    expect(classifyWay(tags({ highway: "primary", oneway: "yes" }))?.oneway).toBe(1);
    expect(classifyWay(tags({ highway: "primary", oneway: "-1" }))?.oneway).toBe(-1);
    expect(classifyWay(tags({ highway: "primary", junction: "roundabout" }))?.oneway).toBe(1);
    expect(classifyWay(tags({ highway: "primary", oneway: "yes", "oneway:bus": "no" }))?.oneway).toBe(0);
  });
});

describe("locateStops", () => {
  it("matches the right pass of a line that returns to where it started", () => {
    // Out east and back west along the same street: the last stop is the start again.
    const shape: LatLon[] = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0].map((step) => [52, 5 + step * 0.002]);
    const at = locateStops(shape, [
      [52, 5],
      [52, 5.012],
      [52, 5],
    ]);
    expect(at).toEqual([0, 6, 12]);
  });
});

describe("locateStopsOnPath", () => {
  it("cuts a ride exactly at its stops, also in the middle of a long straight segment", () => {
    // One straight street of ~1.4 km with no vertices between its ends, like a simplified path.
    const path: LatLon[] = [
      [52, 5],
      [52, 5.02],
    ];
    const stops: LatLon[] = [
      [52.0001, 5.005],
      [52.0001, 5.015],
    ];
    const [from, to] = locateStopsOnPath(path, stops);
    if (!from || !to) throw new Error("stops not located");
    const ride = slicePath(path, from, to);
    expect(ride).toHaveLength(2);
    expect(ride[0]?.[1]).toBeCloseTo(5.005, 6);
    expect(ride[1]?.[1]).toBeCloseTo(5.015, 6);
  });
});
