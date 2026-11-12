// Lazily loaded walking router over the imported road network

import { statSync } from "node:fs"

import { config } from "@/lib/config"

import { readRoadNetwork } from "./road-network"
import { RoadRouter, type LatLon } from "./router"

// --- INTERFACES ---

/** Walking distances over real streets and footpaths. */
export interface Walker {
    /** Metres from `from` to each target, or null where no route is known. */
    distances(from: LatLon, targets: LatLon[], maxMeters: number): (number | null)[]
    /** Outline of everywhere within `maxMeters` on foot, or null when the point is off the network. */
    area(from: LatLon, maxMeters: number): LatLon[] | null
    /** The walking path between two points, or null when either is off the network. */
    route(from: LatLon, to: LatLon): LatLon[] | null
}

// --- SERVICE ---

let cached: { walker: Walker | null; modified: number } | null = null

/**
 * The walker for the road file from "pnpm roads:import", or null when there is none (then walks
 * are estimated from straight lines). Reloaded when the file changes.
 */
export function getWalker(): Walker | null {
    let modified: number
    try {
        modified = statSync(config.roadsPath).mtimeMs
    } catch {
        return null
    }
    if (cached && cached.modified === modified) return cached.walker
    let walker: Walker | null = null
    try {
        const router = new RoadRouter(readRoadNetwork(config.roadsPath))
        walker = {
            distances: (from, targets, maxMeters) => router.walkDistances(from, targets, maxMeters),
            area: (from, maxMeters) => router.walkArea(from, maxMeters),
            route: (from, to) => router.route("foot", from, to),
        }
    } catch (error) {
        console.error(error)
    }
    cached = { walker, modified }
    return walker
}
