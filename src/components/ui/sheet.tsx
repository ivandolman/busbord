// Bottom sheet over the map on a phone, side panel next to it on a wide screen

"use client"

import {
    useEffect,
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
const VISIBLE: Record<Exclude<SheetSnap, "min">, number> = { peek: 0.46, half: 0.72, full: 0.94 }
/** What the lowest snap shows above the home indicator: the handle and the first line of the panel. */
const MIN_VISIBLE_PX = 76
/** Room kept above the fully open sheet, below the status bar or notch. */
const FULL_GAP_PX = 8
const ORDER: SheetSnap[] = ["min", "peek", "half", "full"]
/** A drag shorter than this is a tap on the handle. */
const TAP_PIXELS = 6
const PHONE_QUERY = "(max-width: 1023px)"

const HANDLE_LABEL: Record<SheetSnap, string> = {
    min: "Sheet openen",
    peek: "Sheet verder openen",
    half: "Sheet verder openen",
    full: "Sheet inklappen",
}

// --- STYLING ---

const sheetVariants = cva(
    "bg-background fixed inset-x-0 bottom-0 z-[1100] flex h-[94dvh] flex-col rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.16)] lg:relative lg:z-[1100] lg:h-dvh lg:w-[420px] lg:shrink-0 lg:rounded-none lg:shadow-[4px_0_20px_rgba(0,0,0,0.12)]",
    {
        variants: {
            dragging: {
                true: "",
                false: "transition-transform duration-200 ease-out",
            },
        },
        defaultVariants: {
            dragging: false,
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

// --- COMPONENT ---

/**
 * The board's container: drag or tap the handle to open it further on a phone. Publishes the
 * visible height as --sheet-h, so the map keeps what it fits clear of the sheet.
 */
export function Sheet({
    snap,
    onSnapChange,
    peek = VISIBLE.peek,
    label,
    header,
    className,
    children,
}: SheetProps) {
    const phone = useMediaQuery(PHONE_QUERY)
    const { probe, viewport } = useFixedViewport()
    const [drag, setDrag] = useState<number | null>(null)
    const start = useRef<{ y: number; offset: number } | null>(null)
    const scroller = useRef<HTMLDivElement>(null)

    const { height } = viewport
    const sheetHeight = sheetHeightOf(viewport)
    const offsetOf = (which: SheetSnap) => sheetHeight - visiblePxOf(which, viewport, peek)
    const offset = drag ?? offsetOf(snap)
    const shown = sheetHeight - offset
    const measured = phone && height > 0
    const visibleNow = measured ? Math.round(visiblePxOf(snap, viewport, peek)) : null

    useEffect(() => {
        const root = document.documentElement
        root.style.setProperty("--sheet-h", visibleNow !== null ? `${visibleNow}px` : "0px")
        root.style.setProperty("--app-h", measured ? `${height}px` : "100dvh")
    }, [measured, height, visibleNow])
    useEffect(
        () => () => {
            document.documentElement.style.setProperty("--sheet-h", "0px")
            document.documentElement.style.removeProperty("--app-h")
        },
        [],
    )

    // A new panel starts at the top.
    useEffect(() => {
        scroller.current?.scrollTo({ top: 0 })
    }, [label])

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        start.current = { y: event.clientY, offset: offsetOf(snap) }
        event.currentTarget.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!start.current) return
        const next = start.current.offset + event.clientY - start.current.y
        setDrag(Math.max(0, Math.min(offsetOf("min"), next)))
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
        // The snap nearest to where the sheet was let go, with a nudge in the direction of the drag.
        const at = from.offset + moved - Math.sign(moved) * height * 0.06
        const nearest = ORDER.reduce((best, which) =>
            Math.abs(offsetOf(which) - at) < Math.abs(offsetOf(best) - at) ? which : best,
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
                style={
                    measured
                        ? { height: sheetHeight, transform: `translateY(${offset}px)` }
                        : undefined
                }
                className={cn(sheetVariants({ dragging: drag !== null }), className)}
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
                    className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-2 lg:hidden"
                >
                    <span className="bg-border h-[5px] w-10 rounded-[3px]" />
                </div>
                {header && <div className="hidden shrink-0 lg:block">{header}</div>}
                <div
                    ref={scroller}
                    style={measured ? { maxHeight: Math.max(0, shown - 18) } : undefined}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] lg:px-6 lg:pt-0 lg:pb-6"
                >
                    {children}
                </div>
            </section>
        </>
    )
}
