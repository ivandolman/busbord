// Extracts the road, tram and footpath network from OSM and stores it as a compact binary file

import { readFileSync, writeFileSync } from "node:fs"

import type { BoundingBox } from "@/lib/config"

import { areaChords } from "./area-chords"
import { readPbf } from "./pbf"

// --- CONSTANTS ---

/**
 * Road classes with the cost factor a bus pays per metre; "tram" edges are only for trams and
 * "foot" edges (footpaths, pedestrian streets, cycle paths, steps) only for walking. New classes
 * go at the end: road files store the index.
 */
export const EDGE_CLASSES = [
    ["motorway", 1],
    ["trunk", 1],
    ["primary", 1],
    ["secondary", 1],
    ["tertiary", 1],
    ["unclassified", 1.1],
    ["residential", 1.2],
    ["living_street", 2],
    ["service", 1.4],
    ["busway", 0.9],
    ["road", 1.5],
    ["tram", 1],
    ["foot", 1],
] as const

export const TRAM_CLASS = EDGE_CLASSES.findIndex(([name]) => name === "tram")
export const FOOT_CLASS = EDGE_CLASSES.findIndex(([name]) => name === "foot")
/** Roads nobody walks along. */
export const NO_WALKING_CLASSES: ReadonlySet<number> = new Set([0, 1])
const BUSWAY_CLASS = EDGE_CLASSES.findIndex(([name]) => name === "busway")

/** Edge flag bits: traffic only from → to; no walking along it (foot=no, motorroad, busway). */
export const ONEWAY_FLAG = 1
export const NO_FOOT_FLAG = 2

const FOOT_HIGHWAYS = new Set([
    "footway",
    "pedestrian",
    "path",
    "steps",
    "cycleway",
    "track",
    "bridleway",
    "corridor",
])
const NO = new Set(["no", "private"])

const CLASS_OF_HIGHWAY = new Map<string, number>([
    ["motorway", 0],
    ["motorway_link", 0],
    ["trunk", 1],
    ["trunk_link", 1],
    ["primary", 2],
    ["primary_link", 2],
    ["secondary", 3],
    ["secondary_link", 3],
    ["tertiary", 4],
    ["tertiary_link", 4],
    ["unclassified", 5],
    ["residential", 6],
    ["living_street", 7],
    ["service", 8],
    ["busway", 9],
    ["bus_guideway", 9],
    ["road", 10],
])

const SKIPPED_SERVICE = new Set(["parking_aisle", "driveway", "drive-through", "emergency_access"])
const YES = new Set(["yes", "designated", "permissive"])

const MAGIC = "BBROADS1"

// --- INTERFACES ---

/**
 * The road and tram network used to draw lines along the street. Every OSM node on a kept way is
 * a vertex; every pair of consecutive nodes an edge.
 */
export interface RoadNetwork {
    lat: Float64Array
    lon: Float64Array
    edgeFrom: Uint32Array
    edgeTo: Uint32Array
    /** Index into EDGE_CLASSES. */
    edgeClass: Uint8Array
    /** ONEWAY_FLAG and NO_FOOT_FLAG bits; 0 = two-way and walkable. */
    edgeFlags: Uint8Array
}

/** How a kept OSM way enters the network. */
export interface WayKind {
    roadClass: number
    /** 1 forward, -1 backward, 0 both. */
    oneway: -1 | 0 | 1
    /** Traffic may use it, pedestrians may not. */
    noFoot?: true
    /** A closed outline of an open space people walk across (square, pedestrian area). */
    area?: true
}

// --- HELPERS ---

/** Growable typed array, since the number of kept nodes is not known up front. */
class GrowableFloat64 {
    data = new Float64Array(1 << 20)
    length = 0
    push(value: number): void {
        if (this.length === this.data.length) {
            const next = new Float64Array(this.data.length * 2)
            next.set(this.data)
            this.data = next
        }
        this.data[this.length++] = value
    }
    view(): Float64Array {
        return this.data.subarray(0, this.length)
    }
}

function lowerBound(sorted: Float64Array, value: number): number {
    let low = 0
    let high = sorted.length
    while (low < high) {
        const mid = (low + high) >>> 1
        if ((sorted[mid] as number) < value) low = mid + 1
        else high = mid
    }
    return low
}

// --- SERVICE ---

/** Class index and oneway flag of a way, or null to leave it out. */
export function classifyWay(tags: Map<string, string>): WayKind | null {
    const railway = tags.get("railway")
    if (railway === "tram" || railway === "light_rail") return { roadClass: TRAM_CLASS, oneway: 0 }

    const highway = tags.get("highway")
    const foot = tags.get("foot") ?? ""
    const access = tags.get("access") ?? ""
    // Platforms are mostly mapped as areas: walking along their outline still reaches the stairs
    // and footpaths that end on them, so a walk can start on the platform the train arrives at.
    if (railway === "platform" || highway === "platform") {
        if (NO.has(foot) || NO.has(access)) return null
        return { roadClass: FOOT_CLASS, oneway: 0 }
    }
    if (highway !== undefined && FOOT_HIGHWAYS.has(highway)) {
        if (NO.has(foot) || (NO.has(access) && !YES.has(foot))) return null
        if (tags.get("area") === "yes") return { roadClass: FOOT_CLASS, oneway: 0, area: true }
        return { roadClass: FOOT_CLASS, oneway: 0 }
    }
    const roadClass = highway === undefined ? undefined : CLASS_OF_HIGHWAY.get(highway)
    if (roadClass === undefined) return null
    if (highway === "service" && SKIPPED_SERVICE.has(tags.get("service") ?? "")) return null
    const busAllowed = YES.has(tags.get("bus") ?? "") || YES.has(tags.get("psv") ?? "")
    if (!busAllowed && NO.has(access) && roadClass !== BUSWAY_CLASS) return null
    if (tags.get("area") === "yes") return null

    // Bus lanes, roads closed to traffic but open to buses, "autowegen" and roads signed foot=no
    // stay in the bus network but a walk never follows them.
    const noFoot =
        NO.has(foot) ||
        tags.get("motorroad") === "yes" ||
        ((roadClass === BUSWAY_CLASS || NO.has(access)) && !YES.has(foot))
    const kind = (oneway: -1 | 0 | 1): WayKind =>
        noFoot ? { roadClass, oneway, noFoot: true } : { roadClass, oneway }

    const oneway = tags.get("oneway")
    if (tags.get("oneway:bus") === "no" || tags.get("oneway:psv") === "no") return kind(0)
    if (oneway === "-1") return kind(-1)
    if (oneway === "yes" || oneway === "1" || oneway === "true") return kind(1)
    if (oneway === "no") return kind(0)
    const junction = tags.get("junction")
    if (
        junction === "roundabout" ||
        junction === "circular" ||
        highway === "motorway" ||
        highway === "motorway_link"
    ) {
        return kind(1)
    }
    return kind(0)
}

/**
 * Reads OSM extracts twice (ways, then the nodes they use) and keeps the drivable roads, bus
 * lanes, tram tracks and footpaths that touch the bounding box plus a margin.
 */
export function extractRoadNetwork(
    pbfPaths: string[],
    bbox: BoundingBox,
    log: (message: string) => void = () => {},
    marginDegrees = 0.03,
): RoadNetwork {
    const refs = new GrowableFloat64()
    const wayStart: number[] = []
    const wayClass: number[] = []
    const wayFlags: number[] = []
    /** Ways that outline a walkable open space, crossed by straight lines below. */
    const areaWays: number[] = []
    const seenWays = new Set<number>()

    for (const path of pbfPaths) {
        log(`  ways in ${path}`)
        readPbf(path, {
            wantWays: true,
            way: (way) => {
                if (way.refs.length < 2 || seenWays.has(way.id)) return
                const kind = classifyWay(way.tags)
                if (!kind) return
                seenWays.add(way.id)
                const ordered = kind.oneway === -1 ? [...way.refs].reverse() : way.refs
                if (kind.area && way.refs[0] === way.refs[way.refs.length - 1])
                    areaWays.push(wayClass.length)
                wayStart.push(refs.length)
                wayClass.push(kind.roadClass)
                wayFlags.push(
                    (kind.oneway === 0 ? 0 : ONEWAY_FLAG) | (kind.noFoot ? NO_FOOT_FLAG : 0),
                )
                for (const ref of ordered) refs.push(ref)
            },
        })
    }
    wayStart.push(refs.length)
    log(`  ${wayClass.length} ways, ${refs.length} node references`)

    // Sorted, de-duplicated node ids (a Set of this many numbers would cost far more memory).
    const sortedRefs = Float64Array.from(refs.view()).sort()
    let unique = 0
    for (let i = 0; i < sortedRefs.length; i++) {
        if (i === 0 || sortedRefs[i] !== sortedRefs[i - 1])
            sortedRefs[unique++] = sortedRefs[i] as number
    }
    const needed = sortedRefs.subarray(0, unique)
    const lat = new Float64Array(needed.length).fill(Number.NaN)
    const lon = new Float64Array(needed.length).fill(Number.NaN)

    for (const path of pbfPaths) {
        log(`  nodes in ${path}`)
        // Extracts are sorted by id, so a moving pointer finds each node; binary search otherwise.
        let pointer = 0
        let lastId = -Infinity
        readPbf(path, {
            wantNodes: true,
            node: (id, nodeLat, nodeLon) => {
                if (id >= lastId) {
                    while (pointer < needed.length && (needed[pointer] as number) < id) pointer++
                } else {
                    pointer = lowerBound(needed, id)
                }
                lastId = id
                if (needed[pointer] === id) {
                    lat[pointer] = nodeLat
                    lon[pointer] = nodeLon
                }
            },
        })
    }

    const inBox = (index: number) => {
        const y = lat[index] as number
        const x = lon[index] as number
        return (
            y >= bbox.minLat - marginDegrees &&
            y <= bbox.maxLat + marginDegrees &&
            x >= bbox.minLon - marginDegrees &&
            x <= bbox.maxLon + marginDegrees
        )
    }

    const vertexOf = new Int32Array(needed.length).fill(-1)
    const vertexLat: number[] = []
    const vertexLon: number[] = []
    const vertex = (index: number) => {
        let v = vertexOf[index] as number
        if (v < 0) {
            v = vertexLat.length
            vertexOf[index] = v
            vertexLat.push(lat[index] as number)
            vertexLon.push(lon[index] as number)
        }
        return v
    }

    const edgeFrom: number[] = []
    const edgeTo: number[] = []
    const edgeClass: number[] = []
    const edgeFlags: number[] = []
    const allRefs = refs.view()
    for (let w = 0; w < wayClass.length; w++) {
        const start = wayStart[w] as number
        const end = wayStart[w + 1] as number
        let previous = -1
        for (let r = start; r < end; r++) {
            const index = lowerBound(needed, allRefs[r] as number)
            if (Number.isNaN(lat[index])) {
                previous = -1
                continue
            }
            if (previous >= 0 && (inBox(previous) || inBox(index)) && previous !== index) {
                edgeFrom.push(vertex(previous))
                edgeTo.push(vertex(index))
                edgeClass.push(wayClass[w] as number)
                edgeFlags.push(wayFlags[w] as number)
            }
            previous = index
        }
    }

    // Across a square: straight lines between the points where paths and streets meet its outline.
    const ways = new Uint8Array(needed.length)
    for (let w = 0; w < wayClass.length; w++) {
        const start = wayStart[w] as number
        const end = wayStart[w + 1] as number
        const closed = allRefs[start] === allRefs[end - 1]
        for (let r = start; r < (closed ? end - 1 : end); r++) {
            const index = lowerBound(needed, allRefs[r] as number)
            if ((ways[index] as number) < 2) ways[index]!++
        }
    }
    let chords = 0
    for (const w of areaWays) {
        const indices: number[] = []
        for (let r = wayStart[w] as number; r < (wayStart[w + 1] as number) - 1; r++)
            indices.push(lowerBound(needed, allRefs[r] as number))
        if (indices.some((index) => Number.isNaN(lat[index]) || !inBox(index))) continue
        const ring = indices.map((index): [number, number] => [
            lat[index] as number,
            lon[index] as number,
        ])
        const entrances = indices.flatMap((index, i) => ((ways[index] as number) > 1 ? [i] : []))
        for (const [i, j] of areaChords(ring, entrances)) {
            edgeFrom.push(vertex(indices[i] as number))
            edgeTo.push(vertex(indices[j] as number))
            edgeClass.push(FOOT_CLASS)
            edgeFlags.push(0)
            chords++
        }
    }
    log(`  ${vertexLat.length} vertices, ${edgeFrom.length} edges (${chords} across squares)`)

    return {
        lat: Float64Array.from(vertexLat),
        lon: Float64Array.from(vertexLon),
        edgeFrom: Uint32Array.from(edgeFrom),
        edgeTo: Uint32Array.from(edgeTo),
        edgeClass: Uint8Array.from(edgeClass),
        edgeFlags: Uint8Array.from(edgeFlags),
    }
}
/** Compact binary file: magic, two counts, then the arrays back to back. */
export function writeRoadNetwork(path: string, network: RoadNetwork): void {
    const vertices = network.lat.length
    const edges = network.edgeFrom.length
    const header = Buffer.alloc(16)
    header.write(MAGIC, 0, "latin1")
    header.writeUInt32LE(vertices, 8)
    header.writeUInt32LE(edges, 12)
    const parts = [
        header,
        Buffer.from(Float32Array.from(network.lat).buffer),
        Buffer.from(Float32Array.from(network.lon).buffer),
        Buffer.from(
            network.edgeFrom.buffer,
            network.edgeFrom.byteOffset,
            network.edgeFrom.byteLength,
        ),
        Buffer.from(network.edgeTo.buffer, network.edgeTo.byteOffset, network.edgeTo.byteLength),
        Buffer.from(
            network.edgeClass.buffer,
            network.edgeClass.byteOffset,
            network.edgeClass.byteLength,
        ),
        Buffer.from(
            network.edgeFlags.buffer,
            network.edgeFlags.byteOffset,
            network.edgeFlags.byteLength,
        ),
    ]
    writeFileSync(path, Buffer.concat(parts))
}

export function readRoadNetwork(path: string): RoadNetwork {
    const file = readFileSync(path)
    if (file.toString("latin1", 0, 8) !== MAGIC)
        throw new Error(`${path} is not a road network file`)
    const vertices = file.readUInt32LE(8)
    const edges = file.readUInt32LE(12)
    let offset = 16
    const take = (bytes: number) => {
        // Copy into a fresh, aligned buffer: typed arrays need offsets that are a multiple of their size.
        const slice = new Uint8Array(bytes)
        slice.set(file.subarray(offset, offset + bytes))
        offset += bytes
        return slice.buffer
    }
    const lat = Float64Array.from(new Float32Array(take(vertices * 4)))
    const lon = Float64Array.from(new Float32Array(take(vertices * 4)))
    const edgeFrom = new Uint32Array(take(edges * 4))
    const edgeTo = new Uint32Array(take(edges * 4))
    const edgeClass = new Uint8Array(take(edges))
    const edgeFlags = new Uint8Array(take(edges))
    if (offset !== file.length) throw new Error(`${path} has an unexpected size`)
    return { lat, lon, edgeFrom, edgeTo, edgeClass, edgeFlags }
}
