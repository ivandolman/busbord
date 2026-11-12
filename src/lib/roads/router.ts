import { EDGE_CLASSES, FOOT_CLASS, NO_WALKING_CLASSES, TRAM_CLASS, type RoadNetwork } from "./network";

export type LatLon = [lat: number, lon: number];
/** Buses on roads, trams on tracks, pedestrians on roads (either way) and footpaths. */
export type RouteMode = "road" | "tram" | "foot";

const METERS_PER_DEGREE = 111_320;
const CELL_DEGREES = 0.002;
/** A stop further than this from any road (or track) is not snapped; the caller falls back. */
const MAX_SNAP_METERS = 120;
/** How strongly the route is pulled towards the hint (the feed's own shape). */
const HINT_FULL_PENALTY_METERS = 150;
const MAX_POPS = 200_000;

/** Binary min-heap of vertices keyed by cost. */
class MinHeap {
  private readonly nodes: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  peekKey(): number {
    return this.keys[0] as number;
  }

  push(node: number, key: number): void {
    const { nodes, keys } = this;
    let i = nodes.length;
    nodes.push(node);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((keys[parent] as number) <= key) break;
      nodes[i] = nodes[parent] as number;
      keys[i] = keys[parent] as number;
      i = parent;
    }
    nodes[i] = node;
    keys[i] = key;
  }

  pop(): number {
    const { nodes, keys } = this;
    const top = nodes[0] as number;
    const lastNode = nodes.pop() as number;
    const lastKey = keys.pop() as number;
    if (nodes.length > 0) {
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        if (left >= nodes.length) break;
        const right = left + 1;
        const child = right < nodes.length && (keys[right] as number) < (keys[left] as number) ? right : left;
        if ((keys[child] as number) >= lastKey) break;
        nodes[i] = nodes[child] as number;
        keys[i] = keys[child] as number;
        i = child;
      }
      nodes[i] = lastNode;
      keys[i] = lastKey;
    }
    return top;
  }
}

interface Graph {
  /** Every edge can be used both ways (walking). */
  twoWay: boolean;
  /** CSR adjacency: arcs of vertex v are arcStart[v] .. arcStart[v + 1]. */
  arcStart: Uint32Array;
  arcTo: Uint32Array;
  arcCost: Float32Array;
  /** Edge index of every arc, to find edges back for snapping. */
  grid: Map<number, number[]>;
  edges: number[];
}

interface Snap {
  point: LatLon;
  from: number;
  to: number;
  /** Fraction along from → to. */
  t: number;
  oneway: boolean;
  factor: number;
}

/**
 * Shortest paths over the road network for buses and over tracks for trams, on a flat local
 * projection (fine at the scale of a province). Optionally guided by a hint polyline: arcs far from
 * it cost more, which turns plain routing into a light form of map matching.
 */
export class RoadRouter {
  private readonly cosLat: number;
  private readonly graphs = new Map<RouteMode, Graph>();
  private readonly score: Float64Array;
  private readonly previous: Int32Array;
  private readonly stamp: Uint32Array;
  private round = 0;

  constructor(private readonly network: RoadNetwork) {
    const middle = network.lat.length > 0 ? network.lat.reduce((sum, value) => sum + value, 0) / network.lat.length : 52;
    this.cosLat = Math.cos((middle * Math.PI) / 180);
    const vertices = network.lat.length;
    this.score = new Float64Array(vertices);
    this.previous = new Int32Array(vertices);
    this.stamp = new Uint32Array(vertices);
  }

  private meters(aLat: number, aLon: number, bLat: number, bLon: number): number {
    const dy = (aLat - bLat) * METERS_PER_DEGREE;
    const dx = (aLon - bLon) * METERS_PER_DEGREE * this.cosLat;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private cellKey(lat: number, lon: number): number {
    return Math.floor(lat / CELL_DEGREES) * 100_000 + Math.floor(lon / CELL_DEGREES);
  }

  /** Built when first needed: the app only walks, the importer only drives. */
  private graph(mode: RouteMode): Graph {
    let graph = this.graphs.get(mode);
    if (!graph) {
      graph =
        mode === "tram"
          ? this.build((roadClass) => roadClass === TRAM_CLASS, false)
          : mode === "road"
            ? this.build((roadClass) => roadClass !== TRAM_CLASS && roadClass !== FOOT_CLASS, false)
            : this.build((roadClass) => roadClass !== TRAM_CLASS && !NO_WALKING_CLASSES.has(roadClass), true);
      this.graphs.set(mode, graph);
    }
    return graph;
  }

  private build(include: (roadClass: number) => boolean, twoWay: boolean): Graph {
    const { lat, lon, edgeFrom, edgeTo, edgeClass, edgeOneway } = this.network;
    const vertices = lat.length;
    const degree = new Uint32Array(vertices + 1);
    const edges: number[] = [];
    for (let e = 0; e < edgeFrom.length; e++) {
      if (!include(edgeClass[e] as number)) continue;
      edges.push(e);
      degree[edgeFrom[e] as number]!++;
      if (twoWay || edgeOneway[e] === 0) degree[edgeTo[e] as number]!++;
    }
    const arcStart = new Uint32Array(vertices + 1);
    for (let v = 0; v < vertices; v++) arcStart[v + 1] = (arcStart[v] as number) + (degree[v] as number);
    const fill = arcStart.slice(0, vertices);
    const total = arcStart[vertices] as number;
    const arcTo = new Uint32Array(total);
    const arcCost = new Float32Array(total);
    const grid = new Map<number, number[]>();

    for (const e of edges) {
      const a = edgeFrom[e] as number;
      const b = edgeTo[e] as number;
      const length = this.meters(lat[a] as number, lon[a] as number, lat[b] as number, lon[b] as number);
      // Walking costs plain metres; a bus prefers main roads.
      const cost = twoWay ? length : length * (EDGE_CLASSES[edgeClass[e] as number]?.[1] ?? 1);
      let slot = fill[a]!++;
      arcTo[slot] = b;
      arcCost[slot] = cost;
      if (twoWay || edgeOneway[e] === 0) {
        slot = fill[b]!++;
        arcTo[slot] = a;
        arcCost[slot] = cost;
      }
      // Index the edge in every grid cell its bounding box touches.
      const minLat = Math.min(lat[a] as number, lat[b] as number);
      const maxLat = Math.max(lat[a] as number, lat[b] as number);
      const minLon = Math.min(lon[a] as number, lon[b] as number);
      const maxLon = Math.max(lon[a] as number, lon[b] as number);
      for (let y = Math.floor(minLat / CELL_DEGREES); y <= Math.floor(maxLat / CELL_DEGREES); y++) {
        for (let x = Math.floor(minLon / CELL_DEGREES); x <= Math.floor(maxLon / CELL_DEGREES); x++) {
          const key = y * 100_000 + x;
          const list = grid.get(key);
          if (list) list.push(e);
          else grid.set(key, [e]);
        }
      }
    }
    return { twoWay, arcStart, arcTo, arcCost, grid, edges };
  }

  /** Nearest point on any edge of the mode within MAX_SNAP_METERS. */
  snap(mode: RouteMode, point: LatLon): Snap | null {
    const graph = this.graph(mode);
    const { lat, lon, edgeFrom, edgeTo, edgeOneway, edgeClass } = this.network;
    const cy = Math.floor(point[0] / CELL_DEGREES);
    const cx = Math.floor(point[1] / CELL_DEGREES);
    let best: Snap | null = null;
    let bestDistance = MAX_SNAP_METERS;
    const seen = new Set<number>();
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (const e of graph.grid.get(y * 100_000 + x) ?? []) {
          if (seen.has(e)) continue;
          seen.add(e);
          const a = edgeFrom[e] as number;
          const b = edgeTo[e] as number;
          const ax = (lon[a] as number) * this.cosLat;
          const bx = (lon[b] as number) * this.cosLat;
          const px = point[1] * this.cosLat;
          const dx = bx - ax;
          const dy = (lat[b] as number) - (lat[a] as number);
          const lengthSquared = dx * dx + dy * dy;
          let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (point[0] - (lat[a] as number)) * dy) / lengthSquared;
          t = Math.max(0, Math.min(1, t));
          const qLat = (lat[a] as number) + t * dy;
          const qLon = (lon[a] as number) + t * ((lon[b] as number) - (lon[a] as number));
          const distance = this.meters(point[0], point[1], qLat, qLon);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = {
              point: [qLat, qLon],
              from: a,
              to: b,
              t,
              oneway: !graph.twoWay && edgeOneway[e] === 1,
              factor: graph.twoWay ? 1 : (EDGE_CLASSES[edgeClass[e] as number]?.[1] ?? 1),
            };
          }
        }
      }
    }
    return best;
  }

  /** Squared metres from a point to the hint polyline, capped. */
  /** Increments the search round; vertices stamped with an older round count as unvisited. */
  private nextRound(): number {
    this.round++;
    if (this.round === 0xffffffff) {
      this.stamp.fill(0);
      this.round = 1;
    }
    return this.round;
  }

  /**
   * Shortest walks from a point to every vertex within `maxMeters`, including the bit from the
   * point to the nearest path. Afterwards `reached(v)` gives a vertex's walk, Infinity if beyond.
   */
  private walkSearch(from: LatLon, maxMeters: number): { start: Snap; offset: number; reached: (v: number) => number } | null {
    const start = this.snap("foot", from);
    if (!start) return null;
    const { lat, lon } = this.network;
    const graph = this.graph("foot");
    const round = this.nextRound();
    const heap = new MinHeap();
    const offset = this.meters(from[0], from[1], start.point[0], start.point[1]);
    const relax = (v: number, cost: number) => {
      if (cost > maxMeters || (this.stamp[v] === round && (this.score[v] as number) <= cost)) return;
      this.stamp[v] = round;
      this.score[v] = cost;
      heap.push(v, cost);
    };
    for (const v of [start.from, start.to]) {
      relax(v, offset + this.meters(start.point[0], start.point[1], lat[v] as number, lon[v] as number));
    }
    let pops = 0;
    while (heap.size > 0 && pops++ < MAX_POPS) {
      const key = heap.peekKey();
      const v = heap.pop();
      if (key > (this.score[v] as number) + 1e-6) continue;
      for (let arc = graph.arcStart[v] as number; arc < (graph.arcStart[v + 1] as number); arc++) {
        relax(graph.arcTo[arc] as number, key + (graph.arcCost[arc] as number));
      }
    }
    const reached = (v: number) => (this.stamp[v] === round ? (this.score[v] as number) : Infinity);
    return { start, offset, reached };
  }

  /**
   * Walking distance in metres from one point to each target, along roads and footpaths, or null
   * for a target that is off the network or further than `maxMeters`. The bits between a point
   * and the nearest path are counted as the crow flies.
   */
  walkDistances(from: LatLon, targets: LatLon[], maxMeters: number): (number | null)[] {
    const search = this.walkSearch(from, maxMeters);
    if (!search) return targets.map(() => null);
    const { start, offset, reached } = search;
    const { lat, lon } = this.network;
    const toVertex = (point: LatLon, v: number) => this.meters(point[0], point[1], lat[v] as number, lon[v] as number);
    return targets.map((target) => {
      const end = this.snap("foot", target);
      if (!end) return null;
      let along = Math.min(reached(end.from) + toVertex(end.point, end.from), reached(end.to) + toVertex(end.point, end.to));
      const sameEdge = (end.from === start.from && end.to === start.to) || (end.from === start.to && end.to === start.from);
      if (sameEdge) along = Math.min(along, offset + this.meters(start.point[0], start.point[1], end.point[0], end.point[1]));
      const total = along + this.meters(target[0], target[1], end.point[0], end.point[1]);
      return Number.isFinite(total) && total <= maxMeters ? Math.round(total) : null;
    });
  }

  /**
   * The area you can walk to within `maxMeters`, as a polygon around the point: in each of
   * `rays` directions, the furthest place reached along paths (cut off mid-street where the
   * budget runs out). Null when the point is off the network.
   */
  walkArea(from: LatLon, maxMeters: number, rays = 90): LatLon[] | null {
    const search = this.walkSearch(from, maxMeters);
    if (!search) return null;
    const { reached } = search;
    const { lat, lon, edgeFrom, edgeTo } = this.network;
    const graph = this.graph("foot");
    const furthest: ({ point: LatLon; distance: number } | undefined)[] = new Array(rays);
    const consider = (pLat: number, pLon: number) => {
      const dx = (pLon - from[1]) * this.cosLat;
      const dy = pLat - from[0];
      const angle = Math.atan2(dy, dx) + Math.PI;
      const ray = Math.min(rays - 1, Math.floor((angle / (2 * Math.PI)) * rays));
      const distance = dx * dx + dy * dy;
      const current = furthest[ray];
      if (!current || distance > current.distance) furthest[ray] = { point: [pLat, pLon], distance };
    };
    for (const e of graph.edges) {
      const a = edgeFrom[e] as number;
      const b = edgeTo[e] as number;
      const da = reached(a);
      const db = reached(b);
      if (da === Infinity && db === Infinity) continue;
      const aLat = lat[a] as number;
      const aLon = lon[a] as number;
      const bLat = lat[b] as number;
      const bLon = lon[b] as number;
      const length = this.meters(aLat, aLon, bLat, bLon);
      if (da <= maxMeters) consider(aLat, aLon);
      if (db <= maxMeters) consider(bLat, bLon);
      // Where the budget runs out part-way along the street, from either end.
      for (const [d, fromLat, fromLon, toLat, toLon] of [
        [da, aLat, aLon, bLat, bLon],
        [db, bLat, bLon, aLat, aLon],
      ] as const) {
        if (d <= maxMeters && d + length > maxMeters && length > 0) {
          const t = (maxMeters - d) / length;
          consider(fromLat + t * (toLat - fromLat), fromLon + t * (toLon - fromLon));
        }
      }
    }
    const polygon = furthest.filter((entry) => entry !== undefined).map((entry) => entry.point);
    return polygon.length >= 3 ? polygon : null;
  }

  private hintDistance(hint: Float64Array, lat: number, lon: number): number {
    let best = Infinity;
    const px = lon * this.cosLat;
    for (let i = 2; i < hint.length; i += 2) {
      const aLat = hint[i - 2] as number;
      const ax = (hint[i - 1] as number) * this.cosLat;
      const bLat = hint[i] as number;
      const bx = (hint[i + 1] as number) * this.cosLat;
      const dx = bx - ax;
      const dy = bLat - aLat;
      const lengthSquared = dx * dx + dy * dy;
      let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (lat - aLat) * dy) / lengthSquared;
      t = Math.max(0, Math.min(1, t));
      const ex = (px - (ax + t * dx)) * METERS_PER_DEGREE;
      const ey = (lat - (aLat + t * dy)) * METERS_PER_DEGREE;
      const d = ex * ex + ey * ey;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /**
   * The path from `from` to `to` along roads (or tracks), as a polyline starting and ending on the
   * network, or null when either end is off the network or no path exists.
   */
  route(mode: RouteMode, from: LatLon, to: LatLon, hint: LatLon[] | null = null): LatLon[] | null {
    const start = this.snap(mode, from);
    const end = this.snap(mode, to);
    if (!start || !end) return null;
    const { lat, lon } = this.network;
    const graph = this.graph(mode);
    const hintArray = hint && hint.length >= 2 ? Float64Array.from(hint.flat()) : null;
    const factorAt = (aLat: number, aLon: number, bLat: number, bLon: number) => {
      if (!hintArray) return 1;
      const d = this.hintDistance(hintArray, (aLat + bLat) / 2, (aLon + bLon) / 2);
      return 1 + Math.min(d, HINT_FULL_PENALTY_METERS) / (HINT_FULL_PENALTY_METERS / 2);
    };

    // Both ends on the same edge, in a direction the edge allows: no search needed.
    if (start.from === end.from && start.to === end.to && (end.t >= start.t || !start.oneway)) {
      return [start.point, end.point];
    }

    const round = this.nextRound();
    const heap = new MinHeap();
    const [goalLat, goalLon] = end.point;
    const heuristic = (v: number) => 0.9 * this.meters(lat[v] as number, lon[v] as number, goalLat, goalLon);
    const relax = (v: number, cost: number, via: number) => {
      if (this.stamp[v] === round && (this.score[v] as number) <= cost) return;
      this.stamp[v] = round;
      this.score[v] = cost;
      this.previous[v] = via;
      heap.push(v, cost + heuristic(v));
    };

    // Leave the start point along its edge, only forwards on a one-way edge.
    const edgeCost = (snap: Snap, vertex: number) =>
      this.meters(snap.point[0], snap.point[1], lat[vertex] as number, lon[vertex] as number) *
      snap.factor *
      factorAt(snap.point[0], snap.point[1], lat[vertex] as number, lon[vertex] as number);
    relax(start.to, edgeCost(start, start.to), -1);
    if (!start.oneway) relax(start.from, edgeCost(start, start.from), -1);

    // Arriving: from the end edge's "from" vertex always, from its "to" vertex only on a two-way edge.
    const finish = new Map<number, number>([[end.from, edgeCost(end, end.from)]]);
    if (!end.oneway) finish.set(end.to, edgeCost(end, end.to));

    let bestTotal = Infinity;
    let bestVertex = -1;
    let pops = 0;
    while (heap.size > 0 && pops++ < MAX_POPS) {
      const key = heap.peekKey();
      const v = heap.pop();
      if (key >= bestTotal) break;
      const g = this.score[v] as number;
      if (key > g + heuristic(v) + 1e-6) continue; // stale heap entry
      const tail = finish.get(v);
      if (tail !== undefined && g + tail < bestTotal) {
        bestTotal = g + tail;
        bestVertex = v;
      }
      const vLat = lat[v] as number;
      const vLon = lon[v] as number;
      for (let arc = graph.arcStart[v] as number; arc < (graph.arcStart[v + 1] as number); arc++) {
        const w = graph.arcTo[arc] as number;
        relax(w, g + (graph.arcCost[arc] as number) * factorAt(vLat, vLon, lat[w] as number, lon[w] as number), v);
      }
    }
    if (bestVertex < 0) return null;

    const path: LatLon[] = [end.point];
    for (let v = bestVertex; v >= 0; v = this.previous[v] as number) {
      path.push([lat[v] as number, lon[v] as number]);
      if (this.previous[v] === -1) break;
    }
    path.push(start.point);
    return path.reverse();
  }
}
