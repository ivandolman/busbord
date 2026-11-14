// Straight walking lines across an open space (a square, a pedestrian area) between its entrances

// --- CONSTANTS ---

/** Beyond this many entrances an area keeps only its outline: the pairs grow quadratically. */
const MAX_ENTRANCES = 60

// --- INTERFACES ---

type Point = [lat: number, lon: number]

// --- HELPERS ---

/** Sign of the turn a → b → c on a flat plane (x = lon scaled, y = lat). */
function turn(a: Point, b: Point, c: Point, scale: number): number {
    const value = ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1])) * scale
    return value > 1e-15 ? 1 : value < -1e-15 ? -1 : 0
}

/** Whether segments ab and cd cross at a point inside both (touching ends do not count). */
function crosses(a: Point, b: Point, c: Point, d: Point, scale: number): boolean {
    const d1 = turn(c, d, a, scale)
    const d2 = turn(c, d, b, scale)
    const d3 = turn(a, b, c, scale)
    const d4 = turn(a, b, d, scale)
    return d1 * d2 < 0 && d3 * d4 < 0
}

/** Ray casting: whether a point lies inside the closed ring. */
function inside(point: Point, ring: Point[], scale: number): boolean {
    let result = false
    const x = point[1] * scale
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [yi, xi] = [(ring[i] as Point)[0], (ring[i] as Point)[1] * scale]
        const [yj, xj] = [(ring[j] as Point)[0], (ring[j] as Point)[1] * scale]
        if (yi > point[0] !== yj > point[0] && x < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi)
            result = !result
    }
    return result
}

const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1]

// --- SERVICE ---

/**
 * Pairs of entrances (indices into `ring`) that can be joined by a straight line staying inside
 * the area: across a concave square the line would cut through a building, so it is left out.
 * `ring` is the outline without the closing repeat of its first point.
 */
export function areaChords(ring: Point[], entrances: number[]): [number, number][] {
    if (ring.length < 3 || entrances.length < 2 || entrances.length > MAX_ENTRANCES) return []
    const scale = Math.cos(((ring[0] as Point)[0] * Math.PI) / 180)
    const chords: [number, number][] = []
    for (let p = 0; p < entrances.length; p++) {
        for (let q = p + 1; q < entrances.length; q++) {
            const i = entrances[p] as number
            const j = entrances[q] as number
            // Neighbours on the outline are already joined by it.
            if (Math.abs(i - j) === 1 || Math.abs(i - j) === ring.length - 1) continue
            const a = ring[i] as Point
            const b = ring[j] as Point
            if (same(a, b)) continue
            let blocked = false
            for (let k = 0; k < ring.length && !blocked; k++) {
                const c = ring[k] as Point
                const d = ring[(k + 1) % ring.length] as Point
                blocked = crosses(a, b, c, d, scale)
            }
            if (blocked) continue
            if (!inside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ring, scale)) continue
            chords.push([i, j])
        }
    }
    return chords
}
