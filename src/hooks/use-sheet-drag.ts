// Dragging a bottom sheet between its snaps: by its handle, or anywhere in its content like iOS

"use client"

import {
    useEffect,
    useEffectEvent,
    useRef,
    useState,
    type PointerEvent,
    type RefObject,
} from "react"

// --- CONSTANTS ---

/** A drag shorter than this is a tap. */
const TAP_PIXELS = 6
/** Faster than this (px per ms) is a flick: on to the next snap that way, wherever it was let go. */
const FLICK_SPEED = 0.45
/** A sheet that can be dismissed closes when let go this far below its lowest snap. */
const DISMISS_PIXELS = 48
/** The speed of a drag is measured over this last stretch of it. */
const SPEED_WINDOW_MS = 100

// --- INTERFACES ---

interface UseSheetDragOptions<Snap extends string> {
    /** Snaps from low (most map) to high (most sheet). */
    order: readonly Snap[]
    snap: Snap
    /** How far down the sheet is moved at a snap, in px; 0 is fully open. */
    offsetOf: (snap: Snap) => number
    /** Furthest down a drag may take it (below the lowest snap when it can be dismissed). */
    lowest: number
    /** Screen height, for the nudge towards the direction of the drag. */
    height: number
    /** The content that scrolls; a drag there moves the sheet when it cannot scroll that way. */
    scroller: RefObject<HTMLElement | null>
    enabled: boolean
    onSnapChange: (snap: Snap) => void
    onTap: () => void
    onDismiss?: () => void
}

interface Gesture {
    y: number
    offset: number
    trail: { y: number; t: number }[]
}

// --- HELPERS ---

/** Past the ends a drag gives way slowly, as if on a rubber band. */
function rubberBand(next: number, top: number, bottom: number): number {
    if (next < top) return top - Math.sqrt(top - next) * 2
    if (next > bottom) return bottom + Math.sqrt(next - bottom) * 2
    return next
}

/** Speed in px per ms over the recent trail, positive downwards. */
function speedOf(trail: Gesture["trail"], y: number, t: number): number {
    const first = trail[0]
    return first && t > first.t ? (y - first.y) / (t - first.t) : 0
}

// --- HOOK ---

export function useSheetDrag<Snap extends string>({
    order,
    snap,
    offsetOf,
    lowest,
    height,
    scroller,
    enabled,
    onSnapChange,
    onTap,
    onDismiss,
}: UseSheetDragOptions<Snap>) {
    const [drag, setDrag] = useState<number | null>(null)
    const gesture = useRef<Gesture | null>(null)

    const begin = (y: number, t: number) => {
        gesture.current = { y, offset: offsetOf(snap), trail: [{ y, t }] }
    }
    const move = (y: number, t: number) => {
        const current = gesture.current
        if (!current) return
        current.trail = [
            ...current.trail.filter((point) => t - point.t < SPEED_WINDOW_MS),
            { y, t },
        ]
        setDrag(rubberBand(current.offset + y - current.y, 0, lowest))
    }
    const end = (y: number, t: number, tapped: boolean) => {
        const current = gesture.current
        gesture.current = null
        setDrag(null)
        if (!current) return
        const moved = y - current.y
        if (Math.abs(moved) < TAP_PIXELS) {
            if (tapped) onTap()
            return
        }
        const at = current.offset + moved
        const speed = speedOf(current.trail, y, t)
        const bottom = offsetOf(order[0] as Snap)
        if (
            onDismiss &&
            (at > bottom + DISMISS_PIXELS || (speed > FLICK_SPEED && at >= bottom - 1))
        ) {
            onDismiss()
            return
        }
        if (Math.abs(speed) > FLICK_SPEED) {
            // A flick goes to the next snap in its direction from where the sheet is now.
            const ahead = order.filter((which) =>
                speed > 0 ? offsetOf(which) > at + 1 : offsetOf(which) < at - 1,
            )
            const next = speed > 0 ? ahead.at(-1) : ahead[0]
            if (next) {
                onSnapChange(next)
                return
            }
        }
        // The snap nearest to where the sheet was let go, with a nudge in the direction of the drag.
        const target = at - Math.sign(moved) * height * 0.06
        const nearest = order.reduce((best, which) =>
            Math.abs(offsetOf(which) - target) < Math.abs(offsetOf(best) - target) ? which : best,
        )
        onSnapChange(nearest)
    }
    const cancel = () => {
        gesture.current = null
        setDrag(null)
    }

    // In the content a touch decides once it has moved: down at the top of the content, or up
    // while the sheet is not fully open, moves the sheet; anything else scrolls as usual.
    const touch = useRef<{ x: number; y: number; mode: "undecided" | "sheet" | "scroll" } | null>(
        null,
    )
    const onTouchStart = useEffectEvent((event: TouchEvent) => {
        const point = event.touches[0]
        touch.current =
            enabled && point && event.touches.length === 1
                ? { x: point.clientX, y: point.clientY, mode: "undecided" }
                : null
    })
    const onTouchMove = useEffectEvent((event: TouchEvent) => {
        const state = touch.current
        const point = event.touches[0]
        if (!state || !point || state.mode === "scroll") return
        if (state.mode === "undecided") {
            const dx = point.clientX - state.x
            const dy = point.clientY - state.y
            if (Math.abs(dx) < TAP_PIXELS && Math.abs(dy) < TAP_PIXELS) return
            const atTop = (scroller.current?.scrollTop ?? 0) <= 0
            const highest = order.at(-1)
            const sheetMove =
                Math.abs(dy) > Math.abs(dx) && ((dy > 0 && atTop) || (dy < 0 && snap !== highest))
            state.mode = sheetMove ? "sheet" : "scroll"
            if (!sheetMove) return
            begin(state.y, event.timeStamp)
        }
        if (event.cancelable) event.preventDefault()
        move(point.clientY, event.timeStamp)
    })
    const onTouchEnd = useEffectEvent((event: TouchEvent) => {
        const state = touch.current
        touch.current = null
        const point = event.changedTouches[0]
        if (state?.mode !== "sheet") return
        if (point && event.type === "touchend") end(point.clientY, event.timeStamp, false)
        else cancel()
    })

    useEffect(() => {
        const element = scroller.current
        if (!element) return
        const start = (event: TouchEvent) => onTouchStart(event)
        const moveTouch = (event: TouchEvent) => onTouchMove(event)
        const stop = (event: TouchEvent) => onTouchEnd(event)
        element.addEventListener("touchstart", start, { passive: true })
        // Not passive: a drag that moves the sheet must stop the content from scrolling.
        element.addEventListener("touchmove", moveTouch, { passive: false })
        element.addEventListener("touchend", stop)
        element.addEventListener("touchcancel", stop)
        return () => {
            element.removeEventListener("touchstart", start)
            element.removeEventListener("touchmove", moveTouch)
            element.removeEventListener("touchend", stop)
            element.removeEventListener("touchcancel", stop)
        }
    }, [scroller])

    const handleProps = {
        onPointerDown: (event: PointerEvent<HTMLElement>) => {
            begin(event.clientY, event.timeStamp)
            event.currentTarget.setPointerCapture(event.pointerId)
        },
        onPointerMove: (event: PointerEvent<HTMLElement>) => move(event.clientY, event.timeStamp),
        onPointerUp: (event: PointerEvent<HTMLElement>) =>
            end(event.clientY, event.timeStamp, true),
        onPointerCancel: cancel,
    }

    return { drag, handleProps }
}
