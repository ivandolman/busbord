// Bottom sheet over the map on a phone, side panel next to it on a wide screen

"use client"

import {
    useEffect,
    useEffectEvent,
    useRef,
    useState,
    type KeyboardEvent,
    type PointerEvent,
    type ReactNode,
} from "react"

import { cva } from "class-variance-authority"

import { useFixedViewport, type FixedViewport } from "@/hooks/use-fixed-viewport"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

// --- CONSTANTS ---

/**
 * How far the sheet is open on a phone: "min" is a strip at the bottom (almost the whole map),
 * then "peek", "half" and "full". On a wide screen it is a side panel and always open.
 */
export type SheetSnap = "min" | "peek" | "half" | "full"

/** Part of the screen height each snap shows ("full": at most, see sheetHeightOf). */
export const VISIBLE: Record<Exclude<SheetSnap, "min">, number> = {
    peek: 0.46,
    half: 0.72,
    full: 0.94,
}
/** What the lowest snap shows above the home indicator: the handle and the first line of the panel. */
const MIN_VISIBLE_PX = 76
/** Room kept above the fully open sheet, below the status bar or notch. */
const FULL_GAP_PX = 8
const ORDER: SheetSnap[] = ["min", "peek", "half", "full"]
/** A drag shorter than this is a tap on the handle. */
const TAP_PIXELS = 6
/** Faster than this (px per ms) is a flick: on to the next snap that way, wherever it was let go. */
const FLICK_SPEED = 0.45
/** A sheet that can be dismissed closes when let go this far below its lowest snap. */
const DISMISS_PIXELS = 48
/** How long the slide takes (see sheetVariants); after this a hidden sheet counts as gone. */
const MOTION_MS = 420
/** Below the screen, shadow included. */
const OUT_OF_VIEW_EXTRA_PX = 32
const PHONE_QUERY = "(max-width: 1023px)"

const HANDLE_LABEL: Record<SheetSnap, string> = {
    min: "Sheet openen",
    peek: "Sheet verder openen",
    half: "Sheet verder openen",
    full: "Sheet inklappen",
}

// --- STYLING ---

const sheetVariants = cva(
    "bg-background fixed inset-x-0 bottom-0 flex h-[94dvh] flex-col rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.16)]",
    {
        variants: {
            dragging: {
                true: "",
                false: "ease-sheet transition-transform duration-[420ms] motion-reduce:transition-none",
            },
            layer: {
                board: "z-[1100] lg:relative lg:h-dvh lg:w-[420px] lg:shrink-0 lg:rounded-none lg:shadow-[4px_0_20px_rgba(0,0,0,0.12)]",
                overlay: "z-[1200] lg:hidden",
            },
        },
        defaultVariants: {
            dragging: false,
            layer: "board",
        },
    },
)

// --- INTERFACES ---

interface SheetProps {
    snap: SheetSnap
    onSnapChange: (snap: SheetSnap) => void
    /** Part of the screen the closed sheet shows; less when there is little to show. */
    peek?: number
    label: string
    /** Wide screen only: shown above the content (the phone has its own search bar). */
    header?: ReactNode
    /** "overlay": a phone-only sheet above the board's sheet (a stop's card). */
    layer?: "board" | "overlay"
    /** False slides the sheet out of view; `onHidden` says when it is gone. */
    visible?: boolean
    /** Slide in from below when it first appears. */
    enter?: boolean
    /** Lets a drag down past the lowest snap close the sheet. */
    onDismiss?: () => void
    onHidden?: () => void
    className?: string
    children: ReactNode
}

// --- HELPERS ---

/** The fully open sheet stops below the notch or status bar. */
function sheetHeightOf({ height, safeTop }: FixedViewport): number {
    return height - Math.max(height * (1 - VISIBLE.full), safeTop + FULL_GAP_PX)
}

function visiblePxOf(which: SheetSnap, viewport: FixedViewport, peek: number): number {
    if (which === "min") return MIN_VISIBLE_PX + viewport.safeBottom
    return Math.min(
        sheetHeightOf(viewport),
        viewport.height * (which === "peek" ? peek : VISIBLE[which]),
    )
}

/** Past the ends a drag gives way slowly, as if on a rubber band. */
function rubberBand(next: number, top: number, bottom: number): number {
    if (next < top) return top - Math.sqrt(top - next) * 2
    if (next > bottom) return bottom + Math.sqrt(next - bottom) * 2
    return next
}

/** Pointer speed in px per ms over the recent trail, positive downwards. */
function speedOf(trail: { y: number; t: number }[], y: number, t: number): number {
    const first = trail[0]
    return first && t > first.t ? (y - first.y) / (t - first.t) : 0
}

/** The sheet that last published --sheet-h, so a sheet leaving later does not reset another's. */
let publisher: symbol | null = null

// --- COMPONENT ---

/**
 * The board's container: drag or tap the handle to open it further on a phone, flick to go a
 * snap further. The visible sheet publishes its height as --sheet-h, so the map keeps what it
 * fits clear of it.
 */
export function Sheet({
    snap,
    onSnapChange,
    peek = VISIBLE.peek,
    label,
    header,
    layer,
    visible = true,
    enter = false,
    onDismiss,
    onHidden,
    className,
    children,
}: SheetProps) {
    const phone = useMediaQuery(PHONE_QUERY)
    const { probe, viewport } = useFixedViewport()
    const [drag, setDrag] = useState<number | null>(null)
    const start = useRef<{ y: number; offset: number } | null>(null)
    /** Recent pointer positions, for the speed of the drag when it is let go. */
    const trail = useRef<{ y: number; t: number }[]>([])
    const scroller = useRef<HTMLDivElement>(null)
    const [entered, setEntered] = useState(!enter)
    const [id] = useState(() => Symbol("sheet"))

    const { height } = viewport
    const sheetHeight = sheetHeightOf(viewport)
    const outOfView = sheetHeight + OUT_OF_VIEW_EXTRA_PX
    const offsetOf = (which: SheetSnap) => sheetHeight - visiblePxOf(which, viewport, peek)
    const offset = visible && entered ? (drag ?? offsetOf(snap)) : outOfView
    const shown = Math.max(0, sheetHeight - offset)
    const measured = phone && height > 0
    const visibleNow = measured ? Math.round(visiblePxOf(snap, viewport, peek)) : null

    // Slide in: one frame below the screen, then to the snap.
    useEffect(() => {
        if (entered || !measured) return
        let second = 0
        const first = requestAnimationFrame(() => {
            second = requestAnimationFrame(() => setEntered(true))
        })
        return () => {
            cancelAnimationFrame(first)
            cancelAnimationFrame(second)
        }
    }, [entered, measured])

    // Gone once the slide out has had its time (no transitionend comes with reduced motion).
    const hidden = useEffectEvent(() => onHidden?.())
    useEffect(() => {
        if (visible) return
        const timer = setTimeout(hidden, measured ? MOTION_MS : 0)
        return () => clearTimeout(timer)
    }, [visible, measured])

    useEffect(() => {
        if (!visible) return
        publisher = id
        const root = document.documentElement
        root.style.setProperty("--sheet-h", visibleNow !== null ? `${visibleNow}px` : "0px")
        root.style.setProperty("--app-h", measured ? `${height}px` : "100dvh")
    }, [id, visible, measured, height, visibleNow])
    useEffect(
        () => () => {
            if (publisher !== id) return
            publisher = null
            document.documentElement.style.setProperty("--sheet-h", "0px")
            document.documentElement.style.removeProperty("--app-h")
        },
        [id],
    )

    // A new panel starts at the top.
    useEffect(() => {
        scroller.current?.scrollTo({ top: 0 })
    }, [label])

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        start.current = { y: event.clientY, offset: offsetOf(snap) }
        trail.current = [{ y: event.clientY, t: event.timeStamp }]
        event.currentTarget.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!start.current) return
        trail.current = [
            ...trail.current.filter((point) => event.timeStamp - point.t < 100),
            { y: event.clientY, t: event.timeStamp },
        ]
        const next = start.current.offset + event.clientY - start.current.y
        setDrag(rubberBand(next, 0, onDismiss ? outOfView : offsetOf("min")))
    }
    const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
        const from = start.current
        start.current = null
        setDrag(null)
        if (!from) return
        const moved = event.clientY - from.y
        if (Math.abs(moved) < TAP_PIXELS) {
            onSnapChange(snap === "full" ? "peek" : (ORDER[ORDER.indexOf(snap) + 1] ?? "full"))
            return
        }
        const at = from.offset + moved
        const speed = speedOf(trail.current, event.clientY, event.timeStamp)
        const lowest = offsetOf("min")
        if (
            onDismiss &&
            (at > lowest + DISMISS_PIXELS || (speed > FLICK_SPEED && at >= lowest - 1))
        ) {
            onDismiss()
            return
        }
        if (Math.abs(speed) > FLICK_SPEED) {
            // A flick goes to the next snap in its direction from where the sheet is now.
            const ahead = ORDER.filter((which) =>
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
        const nearest = ORDER.reduce((best, which) =>
            Math.abs(offsetOf(which) - target) < Math.abs(offsetOf(best) - target) ? which : best,
        )
        onSnapChange(nearest)
    }
    const onPointerCancel = () => {
        start.current = null
        setDrag(null)
    }
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onSnapChange(snap === "full" ? "peek" : "full")
        } else if (event.key === "Escape" && onDismiss) {
            onDismiss()
        }
    }

    return (
        <>
            <div
                ref={probe}
                aria-hidden="true"
                className="pointer-events-none invisible fixed inset-0 -z-10 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            />
            <section
                aria-label={label}
                aria-hidden={!visible || undefined}
                inert={!visible}
                style={
                    measured
                        ? { height: sheetHeight, transform: `translateY(${offset}px)` }
                        : undefined
                }
                className={cn(
                    sheetVariants({ dragging: drag !== null, layer }),
                    !measured && !visible && "max-lg:invisible",
                    className,
                )}
            >
                <div
                    role="button"
                    tabIndex={0}
                    aria-label={HANDLE_LABEL[snap]}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onKeyDown={onKeyDown}
                    className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-2 active:cursor-grabbing lg:hidden"
                >
                    <span className="bg-border h-[5px] w-10 rounded-[3px]" />
                </div>
                {header && <div className="hidden shrink-0 lg:block">{header}</div>}
                <div
                    ref={scroller}
                    style={measured ? { maxHeight: Math.max(0, shown - 18) } : undefined}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] lg:px-6 lg:pt-0 lg:pb-6"
                >
                    {/* Keyed by panel, so a new panel fades in instead of popping. */}
                    <div
                        key={label}
                        className="animate-sheet-content-in motion-reduce:animate-none"
                    >
                        {children}
                    </div>
                </div>
            </section>
        </>
    )
}
