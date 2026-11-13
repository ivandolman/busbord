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
/** Kinks and knots at junctions: pieces shorter than this between two junctions fold into one. */
const JUNCTION_METERS = 20
/** A loop back to the same junction this short is snapping noise, not a turning loop. */
const NOISE_LOOP_METERS = 60
/** Two strands between the same junctions this close together are one road (both carriageways). */
const PARALLEL_METERS = 60
/** Three junctions joined by pieces this short are one junction drawn as a little triangle. */
const TRIANGLE_METERS = 60
/**
 * A dead end this short off a junction, whose lines all go on along another road from there, is
 * where a line ends just past the junction: drawn, it is a stray stub.
 */
const STUB_METERS = 60
/**
 * A line's own dead end this short, away from where the line starts or ends, is snapping noise: its
 * path wandered onto the other carriageway for one node and came straight back.
 */
const SPUR_METERS = 40
/** A hop this many times longer than skipping its node is a sideways detour, not a bend. */
const DETOUR_RATIO = 1.6
/** A sharp back-and-forth with a leg this short is snapping noise. */
const SPIKE_METERS = 15
/** Straightens noise before rounding; corners left after it are real bends. */
const DENOISE_METERS = 3
/** Corner-cutting rounds: each one rounds the bends further. */
const ROUNDING_PASSES = 3
const SIMPLIFY_METERS = 0.8

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

    degree(node: number): number {
        return this.edges[node]?.size ?? 0
    }

    removeEdge(a: number, b: number): void {
        this.edges[a]?.delete(b)
        this.edges[b]?.delete(a)
    }

    /** Folds node b into node a: b's edges move to a, its points count towards a's position. */
    merge(a: number, b: number): void {
        if (a === b) return
        for (const [neighbour, edge] of [...(this.edges[b] ?? [])]) {
            this.removeEdge(b, neighbour)
            if (neighbour === a) continue
            const existing = this.edges[a]?.get(neighbour)
            if (existing) {
                for (const line of edge.lines) existing.lines.add(line)
            } else {
                this.edges[a]?.set(neighbour, edge)
                this.edges[neighbour]?.set(a, edge)
            }
        }
        this.sumX[a] = (this.sumX[a] as number) + (this.sumX[b] as number)
        this.sumY[a] = (this.sumY[a] as number) + (this.sumY[b] as number)
        this.count[a] = (this.count[a] as number) + (this.count[b] as number)
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

/** Chaikin corner cutting: every bend becomes a rounder one; the ends stay where they are. */
function round(points: [number, number][]): [number, number][] {
    if (points.length < 3) return points
    const result: [number, number][] = [points[0] as [number, number]]
    for (let i = 1; i < points.length; i++) {
        const [ax, ay] = points[i - 1] as [number, number]
        const [bx, by] = points[i] as [number, number]
        if (i > 1) result.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25])
        if (i < points.length - 1) result.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75])
    }
    result.push(points[points.length - 1] as [number, number])
    return result
}

/** Drops points where the path doubles back over a short leg: snapping noise, not a road. */
function despike(points: [number, number][]): [number, number][] {
    let result = points
    for (let changed = true; changed && result.length > 2;) {
        changed = false
        const kept: [number, number][] = [result[0] as [number, number]]
        for (let i = 1; i < result.length - 1; i++) {
            const [ax, ay] = kept[kept.length - 1] as [number, number]
            const [bx, by] = result[i] as [number, number]
            const [cx, cy] = result[i + 1] as [number, number]
            const ab = Math.hypot(bx - ax, by - ay)
            const bc = Math.hypot(cx - bx, cy - by)
            const cos =
                ab === 0 || bc === 0 ? 1 : ((bx - ax) * (cx - bx) + (by - ay) * (cy - by)) / ab / bc
            if (cos < -0.2 && Math.min(ab, bc) < SPIKE_METERS) {
                changed = true
                continue
            }
            kept.push([bx, by])
        }
        kept.push(result[result.length - 1] as [number, number])
        result = kept
    }
    return result
}

/** Largest distance from any point of `a` to the polyline `b`. */
function farthest(a: [number, number][], b: [number, number][]): number {
    let worst = 0
    for (const [px, py] of a) {
        let best = Infinity
        for (let i = 1; i < b.length; i++) {
            const [ax, ay] = b[i - 1] as [number, number]
            const [bx, by] = b[i] as [number, number]
            const dx = bx - ax
            const dy = by - ay
            const lengthSquared = dx * dx + dy * dy
            let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared
            t = Math.max(0, Math.min(1, t))
            best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
        }
        worst = Math.max(worst, best)
    }
    return worst
}

/**
 * Drops nodes a path only touches in a short sideways hop: A → B → A, or A → B → C where going
 * through B is much longer than going from A to C. That is a path between two carriageways
 * snapping to the far one for a node; kept, it draws a rung between both strands.
 */
function skipDetours(graph: CorridorGraph, nodes: number[]): number[] {
    const kept = [nodes[0] as number]
    // One pass, and never two hops in a row: repeated, it would eat a turning loop node by node.
    let skipped = false
    for (let i = 1; i < nodes.length; i++) {
        const a = kept[kept.length - 1] as number
        const b = nodes[i] as number
        const c = nodes[i + 1]
        if (c === undefined || skipped || graph.distance(a, b) >= SPUR_METERS) {
            if (b !== a) kept.push(b)
            skipped = false
            continue
        }
        const back = a === c
        // B → C → B is a hop out to C: B stays, C goes on the next step.
        const sideways =
            nodes[i + 2] !== b &&
            graph.distance(b, c) < SPUR_METERS &&
            graph.distance(a, b) + graph.distance(b, c) > DETOUR_RATIO * graph.distance(a, c)
        if (back || sideways) {
            skipped = true
            if (back) i++
            continue
        }
        kept.push(b)
    }
    return kept
}

/**
 * Takes each line off short spurs where it dead-ends at a node that is not one of its terminals,
 * and drops edges left without lines. Such spurs come from a path between two carriageways that
 * snaps to the far one for a node; on the map they show as rungs between both strands. A spur is
 * measured whole, up to where the line forks, so a real turn up a side street and back stays.
 */
function pruneLineSpurs(graph: CorridorGraph, terminals: Map<number, Set<number>>): void {
    const lineEdges = (node: number, line: number) =>
        [...(graph.edges[node] as Map<number, Edge>)].filter(([, edge]) => edge.lines.has(line))
    for (let node = 0; node < graph.x.length; node++) {
        const lines = new Set(
            [...(graph.edges[node] as Map<number, Edge>).values()].flatMap((e) => [...e.lines]),
        )
        for (const line of lines) {
            if (terminals.get(line)?.has(node)) continue
            let onward = lineEdges(node, line)
            if (onward.length !== 1) continue
            const spur: Edge[] = []
            let length = 0
            let from = node
            while (onward.length === 1 && length < SPUR_METERS) {
                const [next, edge] = onward[0] as [number, Edge]
                spur.push(edge)
                length += edge.length
                onward = lineEdges(next, line).filter(([neighbour]) => neighbour !== from)
                from = next
            }
            if (length >= SPUR_METERS || onward.length < 2) continue
            for (const edge of spur) edge.lines.delete(line)
        }
    }
    for (let a = 0; a < graph.x.length; a++) {
        for (const [b, edge] of [...(graph.edges[a] as Map<number, Edge>)]) {
            if (edge.lines.size === 0) graph.removeEdge(a, b)
        }
    }
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

/** Whether every line along the piece also leaves `junction` along another edge. */
function linesGoOn(graph: CorridorGraph, junction: number, nodes: number[]): boolean {
    const edges = graph.edges[junction] as Map<number, Edge>
    const elsewhere = new Set<number>()
    for (const [neighbour, edge] of edges) {
        if (neighbour !== nodes[1]) for (const line of edge.lines) elsewhere.add(line)
    }
    for (let i = 1; i < nodes.length; i++) {
        const edge = graph.edges[nodes[i - 1] as number]?.get(nodes[i] as number)
        for (const line of edge?.lines ?? []) if (!elsewhere.has(line)) return false
    }
    return true
}

/** The chain of nodes from `start` through `next` up to the next junction, and its length. */
function chain(
    graph: CorridorGraph,
    position: (node: number) => [number, number],
    isBreak: (node: number) => boolean,
    start: number,
    next: number,
): { nodes: number[]; length: number } {
    const nodes = [start, next]
    let length = 0
    let from = start
    let at = next
    for (;;) {
        const [ax, ay] = position(from)
        const [bx, by] = position(at)
        length += Math.hypot(bx - ax, by - ay)
        if (at === start || isBreak(at)) break
        const onward = [...(graph.edges[at] as Map<number, Edge>).keys()].find(
            (neighbour) => neighbour !== from,
        )
        if (onward === undefined) break
        from = at
        at = onward
        nodes.push(at)
    }
    return { nodes, length }
}

/**
 * Cleans what snapping leaves at junctions: short pieces between two junctions fold into one
 * junction, short loops and stubs go (also dead ends whose lines go on along another road),
 * and two strands between the same junctions that lie
 * close together (both carriageways of a road) become one.
 */
function tidyJunctions(
    graph: CorridorGraph,
    position: (node: number) => [number, number],
    isBreak: (node: number) => boolean,
): void {
    for (let pass = 0, changed = true; changed && pass < 6; pass++) {
        changed = false
        for (let node = 0; node < graph.x.length; node++) {
            if (graph.degree(node) === 0 || !isBreak(node)) continue
            const strands = new Map<number, { nodes: number[]; length: number }[]>()
            for (const neighbour of [...(graph.edges[node] as Map<number, Edge>).keys()]) {
                if (!graph.edges[node]?.has(neighbour)) continue
                const piece = chain(graph, position, isBreak, node, neighbour)
                const end = piece.nodes[piece.nodes.length - 1] as number
                if (end === node) {
                    if (piece.length < NOISE_LOOP_METERS) {
                        for (let i = 1; i < piece.nodes.length; i++) {
                            graph.removeEdge(piece.nodes[i - 1] as number, piece.nodes[i] as number)
                        }
                        changed = true
                    }
                } else if (piece.length < JUNCTION_METERS) {
                    if (graph.degree(end) === 1 || isBreak(end)) {
                        for (const other of piece.nodes.slice(1)) graph.merge(node, other)
                        changed = true
                    }
                } else if (
                    piece.length < STUB_METERS &&
                    graph.degree(end) === 1 &&
                    graph.degree(node) >= 3 &&
                    linesGoOn(graph, node, piece.nodes)
                ) {
                    for (let i = 1; i < piece.nodes.length; i++) {
                        graph.removeEdge(piece.nodes[i - 1] as number, piece.nodes[i] as number)
                    }
                    changed = true
                } else {
                    strands.set(end, [...(strands.get(end) ?? []), piece])
                }
            }
            // A triangle of short pieces between three junctions folds into this one.
            const short = [...strands.entries()].filter(([, pieces]) =>
                pieces.some((piece) => piece.length < TRIANGLE_METERS),
            )
            for (const [b, piecesB] of short) {
                if (graph.degree(b) === 0) continue
                for (const [c, piecesC] of short) {
                    if (c <= b || graph.degree(c) === 0) continue
                    const across = [...(graph.edges[b] as Map<number, Edge>).keys()]
                        .map((next) => chain(graph, position, isBreak, b, next))
                        .find(
                            (piece) =>
                                piece.nodes[piece.nodes.length - 1] === c &&
                                piece.length < TRIANGLE_METERS,
                        )
                    if (!across) continue
                    const isShort = (piece: { length: number }) => piece.length < TRIANGLE_METERS
                    const inner = [
                        ...piecesB.filter(isShort).flatMap((piece) => piece.nodes),
                        ...piecesC.filter(isShort).flatMap((piece) => piece.nodes),
                        ...across.nodes,
                    ]
                    for (const other of new Set(inner)) graph.merge(node, other)
                    strands.delete(b)
                    strands.delete(c)
                    changed = true
                }
            }
            for (const pieces of strands.values()) {
                if (pieces.length < 2) continue
                const [keep, drop] = pieces.sort((a, b) => a.length - b.length) as [
                    (typeof pieces)[number],
                    (typeof pieces)[number],
                ]
                const keepPoints = keep.nodes.map(position)
                const dropPoints = drop.nodes.map(position)
                if (
                    drop.length > keep.length * 1.5 ||
                    farthest(dropPoints, keepPoints) > PARALLEL_METERS
                ) {
                    continue
                }
                // The lines of the dropped strand move onto the kept one.
                const moved = new Set<number>()
                for (let i = 1; i < drop.nodes.length; i++) {
                    const a = drop.nodes[i - 1] as number
                    const b = drop.nodes[i] as number
                    for (const line of graph.edges[a]?.get(b)?.lines ?? []) moved.add(line)
                    graph.removeEdge(a, b)
                }
                for (let i = 1; i < keep.nodes.length; i++) {
                    const edge = graph.edges[keep.nodes[i - 1] as number]?.get(
                        keep.nodes[i] as number,
                    )
                    for (const line of moved) edge?.lines.add(line)
                }
                changed = true
            }
        }
    }
}

// --- SERVICE ---

/** Trams first, then by line number: the order lines lie side by side along a shared road. */
export function compareDrawingOrder(
    a: { mode: string; line: string },
    b: { mode: string; line: string },
): number {
    const railA = a.mode === "bus" ? 1 : 0
    const railB = b.mode === "bus" ? 1 : 0
    return railA - railB || a.line.localeCompare(b.line, "nl", { numeric: true })
}

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
    const terminals = new Map<number, Set<number>>()
    for (const input of inputs) {
        const ends = terminals.get(input.index) ?? new Set<number>()
        terminals.set(input.index, ends)
        for (const path of input.paths) {
            const nodes: number[] = []
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
                    if (node !== nodes[nodes.length - 1]) nodes.push(node)
                }
                before = [x, y]
            }
            const kept = skipDetours(graph, nodes)
            for (let i = 1; i < kept.length; i++) {
                graph.connect(kept[i - 1] as number, kept[i] as number, input.index)
            }
            if (kept.length > 0) {
                ends.add(kept[0] as number)
                ends.add(kept[kept.length - 1] as number)
            }
        }
    }
    pruneLineSpurs(graph, terminals)

    const position = (node: number): [number, number] => [
        (graph.sumX[node] as number) / (graph.count[node] as number),
        (graph.sumY[node] as number) / (graph.count[node] as number),
    ]
    // A corridor ends where the road forks or the set of lines along it changes.
    const isBreak = (node: number) => {
        const edges = [...(graph.edges[node]?.values() ?? [])]
        return edges.length !== 2 || !sameLines(edges[0]!.lines, edges[1]!.lines)
    }

    // Tidying looks at the road's shape only: where it forks, not where lines join or leave.
    tidyJunctions(graph, position, (node) => graph.degree(node) !== 2)

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
        let points = simplify(despike(nodes.map(position)), DENOISE_METERS)
        for (let pass = 0; pass < ROUNDING_PASSES; pass++) points = round(points)
        points = simplify(points, SIMPLIFY_METERS)
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
