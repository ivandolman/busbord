// The stop card as a bottom sheet in <body> on a phone

"use client"

import { useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

// --- INTERFACES ---

interface StopSheetProps {
    stopName: string
    children: ReactNode
}

// --- COMPONENT ---

/**
 * In <body>, because the map sits in its own stacking context under the board's sheet.
 */
export default function StopSheet({ stopName, children }: StopSheetProps) {
    const body = useSyncExternalStore(subscribeNever, clientBody, serverBody)
    if (!body) return null
    return createPortal(
        <section
            aria-label={`Halte ${stopName}`}
            className="bg-background fixed inset-x-0 bottom-0 z-[1200] max-h-[calc(var(--app-h,100dvh)*0.78)] overflow-y-auto overscroll-contain rounded-t-3xl px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.16)] lg:hidden"
        >
            <div className="flex justify-center pt-2 pb-1">
                <span className="bg-border h-[5px] w-10 rounded-[3px]" />
            </div>
            {children}
        </section>,
        body,
    )
}

// --- HELPERS ---

const subscribeNever = () => () => {}

const clientBody = (): HTMLElement | null => document.body

const serverBody = (): HTMLElement | null => null
