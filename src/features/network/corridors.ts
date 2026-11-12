// Merges the paths of all lines into shared corridors, so lines along the same road draw side by side

import type { LatLon } from "@/features/roads/router"

/**
 * Every line's paths (both directions, every pattern) are laid onto one graph. A point within
 * SNAP_METERS of a node already in the graph joins that node, so both carriageways of a road and
 * every line along it end up on one centre line. Chains of edges carrying the same lines become
 * one corridor; the map draws its lines next to each other at a fixed pixel offset.
 */

// --- CONSTANTS ---

const METERS_PER_DEGREE = 111_320
/** Further apart than both carriageways of a wide road, closer than two parallel streets. */
const SNAP_METERS = 25
const STEP_METERS = 8
/** How far a shortcut over existing edges may wander when a point skips a node. */
const MAX_DETOUR_HOPS = 6
const SIMPLIFY_METERS = 1.5

// --- INTERFACES ---

export interface CorridorInput {
    /** The line's index in the network; corridors list these. */
    index: number
    paths: LatLon[][]
}

export interface Corridor {
    path: LatLon[]
    /** Line indexes along this corridor, in the order they are drawn from left to right. */
    lines: number[]
}

interface Edge {
    lines: Set<number>
    length: number
}

// --- HELPERS ---

class CorridorGraph {
    readonly x: number[] = []
    readonly y: number[] = []
    /** Sum and count of every point snapped to a node, for its final (mean) position. */
    readonly sumX: number[] = []
    readonly sumY: number[] = []
    readonly count: number[] = []
    readonly edges: Map<number, Edge>[] = []
    private readonly grid = new Map<string, number[]>()

    /** The nearest node within SNAP_METERS of (x, y), or a new node there. */
    nodeAt(x: number, y: number): number {
        const cx = Math.floor(x / SNAP_METERS)
        const cy = Math.floor(y / SNAP_METERS)
        let best = -1
        let bestDistance = SNAP_METERS * SNAP_METERS
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (const node of this.grid.get(`${cx + dx},${cy + dy}`) ?? []) {
                    const ex = (this.x[node] as number) - x
                    const ey = (this.y[node] as number) - y
                    const distance = ex * ex + ey * ey
                    if (distance <= bestDistance) {
                        best = node
                        bestDistance = distance
                    }
                }
            }
        }
        if (best < 0) {
            best = this.x.length
            this.x.push(x)
            this.y.push(y)
            this.sumX.push(0)
            this.sumY.push(0)
            this.count.push(0)
            this.edges.push(new Map())
            const key = `${cx},${cy}`
            const cell = this.grid.get(key)
            if (cell) cell.push(best)
            else this.grid.set(key, [best])
        }
        this.sumX[best] = (this.sumX[best] as number) + x
        this.sumY[best] = (this.sumY[best] as number) + y
        this.count[best] = (this.count[best] as number) + 1
        return best
    }

    /** Puts `line` on the edge a-b, or on a short existing route between them when there is one. */
    connect(a: number, b: number, line: number): void {
        const existing = this.edges[a]?.get(b)
        if (existing) {
            existing.lines.add(line)
            return
        }
        const direct = this.distance(a, b)
        const route = this.shortRoute(a, b, direct * 1.5 + SNAP_METERS)
        if (route) {
            for (let i = 1; i < route.length; i++) {
                this.edges[route[i - 1] as number]?.get(route[i] as number)?.lines.add(line)
            }
            return
        }
        const edge: Edge = { lines: new Set([line]), length: direct }
        this.edges[a]?.set(b, edge)
        this.edges[b]?.set(a, edge)
    }

    distance(a: number, b: number): number {
        return Math.hypot(
            (this.x[a] as number) - (this.x[b] as number),
            (this.y[a] as number) - (this.y[b] as number),
        )
    }

    /** Fewest-hops route from a to b over existing edges, no longer than `limit` metres. */
    private shortRoute(a: number, b: number, limit: number): number[] | null {
        const previous = new Map<number, number>([[a, -1]])
        const travelled = new Map<number, number>([[a, 0]])
        let frontier = [a]
        for (let hop = 0; hop < MAX_DETOUR_HOPS && frontier.length > 0; hop++) {
            const next: number[] = []
            for (const node of frontier) {
                for (const [neighbour, edge] of this.edges[node] ?? []) {
                    if (previous.has(neighbour)) continue
                    const length = (travelled.get(node) as number) + edge.length
                    if (length > limit) continue
                    previous.set(neighbour, node)
                    travelled.set(neighbour, length)
                    if (neighbour === b) {
                        const route = [b]
                        let at = node
                        while (at >= 0) {
                            route.unshift(at)
                            at = previous.get(at) as number
                        }
                        return route
                    }
                    next.push(neighbour)
                }
            }
            frontier = next
        }
        return null
    }
}

function sameLines(a: Set<number>, b: Set<number>): boolean {
    if (a.size !== b.size) return false
    for (const line of a) if (!b.has(line)) return false
    return true
}

/** Each interior point moves halfway to the middle of its neighbours; ends stay put. */
function smooth(points: [number, number][]): [number, number][] {
    if (points.length < 3) return points
    return points.map((point, i) => {
        const before = points[i - 1]
        const after = points[i + 1]
        if (!before || !after) return point
        return [
            point[0] * 0.5 + (before[0] + after[0]) * 0.25,
            point[1] * 0.5 + (before[1] + after[1]) * 0.25,
        ]
    })
}

/** Douglas-Peucker on metric points. */
function simplify(points: [number, number][], tolerance: number): [number, number][] {
    if (points.length <= 2) return points
    const keep = new Uint8Array(points.length)
    keep[0] = 1
    keep[points.length - 1] = 1
    const stack: [number, number][] = [[0, points.length - 1]]
    while (stack.length > 0) {
        const [first, last] = stack.pop() as [number, number]
        const [ax, ay] = points[first] as [number, number]
        const [bx, by] = points[last] as [number, number]
        const dx = bx - ax
        const dy = by - ay
        const lengthSquared = dx * dx + dy * dy
        let worst = -1
        let worstDistance = tolerance
        for (let i = first + 1; i < last; i++) {
            const [px, py] = points[i] as [number, number]
            let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared
            t = Math.max(0, Math.min(1, t))
            const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if (distance > worstDistance) {
                worst = i
                worstDistance = distance
            }
        }
        if (worst >= 0) {
            keep[worst] = 1
            stack.push([first, worst], [worst, last])
        }
    }
    return points.filter((_, i) => keep[i] === 1)
}

// --- SERVICE ---

/**
 * Corridors for the given lines. Inputs come in drawing order (the first line is drawn leftmost
 * wherever lines share a road), and earlier lines shape the shared centre lines.
 */
export function buildCorridors(inputs: CorridorInput[]): Corridor[] {
    const first = inputs.find((input) => input.paths[0]?.[0])?.paths[0]?.[0]
    if (!first) return []
    const cosLat = Math.cos((first[0] * Math.PI) / 180)
    const toX = (lon: number) => lon * METERS_PER_DEGREE * cosLat
    const toY = (lat: number) => lat * METERS_PER_DEGREE
    const rank = new Map(inputs.map((input, i) => [input.index, i]))

    const graph = new CorridorGraph()
    for (const input of inputs) {
        for (const path of input.paths) {
            let previous = -1
            let before: [number, number] | null = null
            for (const [lat, lon] of path) {
                const x = toX(lon)
                const y = toY(lat)
                // Densify, so a long straight piece still meets the nodes along its road.
                const [bx, by] = before ?? [x, y]
                const steps = Math.max(1, Math.ceil(Math.hypot(x - bx, y - by) / STEP_METERS))
                for (let step = 1; step <= steps; step++) {
                    const t = step / steps
                    const node = graph.nodeAt(bx + (x - bx) * t, by + (y - by) * t)
                    if (node === previous) continue
                    if (previous >= 0) graph.connect(previous, node, input.index)
                    previous = node
                }
                before = [x, y]
            }
        }
    }

    const position = (node: number): [number, number] => [
        (graph.sumX[node] as number) / (graph.count[node] as number),
        (graph.sumY[node] as number) / (graph.count[node] as number),
    ]
    // A corridor ends where the road forks or the set of lines along it changes.
    const isBreak = (node: number) => {
        const edges = [...(graph.edges[node]?.values() ?? [])]
        return edges.length !== 2 || !sameLines(edges[0]!.lines, edges[1]!.lines)
    }

    const corridors: Corridor[] = []
    const done = new Set<Edge>()
    const walk = (start: number, firstStep: number, edge: Edge) => {
        const nodes = [start, firstStep]
        done.add(edge)
        let at = firstStep
        let from = start
        while (!isBreak(at) && at !== start) {
            const onward = [...(graph.edges[at] as Map<number, Edge>)].find(
                ([neighbour, next]) => neighbour !== from && !done.has(next),
            )
            if (!onward) break
            done.add(onward[1])
            from = at
            at = onward[0]
            nodes.push(at)
        }
        let points = simplify(smooth(smooth(nodes.map(position))), SIMPLIFY_METERS)
        // A fixed orientation (eastward, or northward when mostly vertical) keeps each line on
        // the same side of a corridor and the next one along the road.
        const [sx, sy] = points[0] as [number, number]
        const [ex, ey] = points[points.length - 1] as [number, number]
        const eastward = Math.abs(ex - sx) >= Math.abs(ey - sy)
        if (eastward ? ex < sx : ey < sy) points = [...points].reverse()
        corridors.push({
            path: points.map(([x, y]) => [
                Math.round((y / METERS_PER_DEGREE) * 1e5) / 1e5,
                Math.round((x / METERS_PER_DEGREE / cosLat) * 1e5) / 1e5,
            ]),
            lines: [...edge.lines].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0)),
        })
    }

    for (let node = 0; node < graph.x.length; node++) {
        if (!isBreak(node)) continue
        for (const [neighbour, edge] of graph.edges[node] as Map<number, Edge>) {
            if (!done.has(edge)) walk(node, neighbour, edge)
        }
    }
    // Loops without any break (a circular line on its own).
    for (let node = 0; node < graph.x.length; node++) {
        for (const [neighbour, edge] of graph.edges[node] as Map<number, Edge>) {
            if (!done.has(edge)) walk(node, neighbour, edge)
        }
    }
    return corridors
}
