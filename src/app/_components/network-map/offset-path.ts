// Shifts a screen polyline sideways by a fixed distance, for drawing bundled lines next to each other

// --- CONSTANTS ---

/** A sharp bend would push the mitred corner far out; cap it at this many times the offset. */
const MAX_MITER = 3

// --- INTERFACES ---

export type ScreenPoint = [x: number, y: number]

// --- HELPERS ---

function normal(a: ScreenPoint, b: ScreenPoint): ScreenPoint | null {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const length = Math.hypot(dx, dy)
    return length === 0 ? null : [-dy / length, dx / length]
}

// --- SERVICE ---

/**
 * The polyline moved `distance` pixels to the left of its direction (negative: to the right),
 * with mitred corners, so parallel copies keep the same gap through every bend.
 */
export function offsetPath(points: ScreenPoint[], distance: number): ScreenPoint[] {
    if (distance === 0 || points.length < 2) return points
    const normals: (ScreenPoint | null)[] = []
    for (let i = 1; i < points.length; i++) {
        normals.push(normal(points[i - 1] as ScreenPoint, points[i] as ScreenPoint))
    }
    // A repeated point has no direction of its own: it takes its neighbour's.
    let last = normals.find((n) => n !== null)
    if (!last) return points
    const filled = normals.map((n) => (last = n ?? last))
    return points.map(([x, y], i) => {
        const before = filled[i - 1] ?? filled[i]
        const after = filled[i] ?? filled[i - 1]
        if (!before || !after) return [x, y]
        const mx = before[0] + after[0]
        const my = before[1] + after[1]
        const length = Math.hypot(mx, my)
        if (length < 1e-9) return [x + before[0] * distance, y + before[1] * distance]
        const ux = mx / length
        const uy = my / length
        const cos = ux * before[0] + uy * before[1]
        const scale = Math.min(1 / Math.max(cos, 1e-9), MAX_MITER)
        return [x + ux * distance * scale, y + uy * distance * scale]
    })
}
