// The stop card as a draggable bottom sheet in <body> on a phone

"use client"

import { useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { Sheet, type SheetSnap } from "@/components/ui/sheet"

// --- INTERFACES ---

interface StopSheetProps {
    stopName: string
    /** False while it slides away after closing; `onHidden` says when it is gone. */
    visible: boolean
    snap: SheetSnap
    onSnapChange: (snap: SheetSnap) => void
    onClose: () => void
    onHidden: () => void
    children: ReactNode
}

// --- COMPONENT ---

/**
 * In <body>, because the map sits in its own stacking context under the board's sheet. Slides
 * in over the board's sheet and closes with a drag down past its lowest height.
 */
export default function StopSheet({
    stopName,
    visible,
    snap,
    onSnapChange,
    onClose,
    onHidden,
    children,
}: StopSheetProps) {
    const body = useSyncExternalStore(subscribeNever, clientBody, serverBody)
    if (!body) return null
    return createPortal(
        <Sheet
            snap={snap}
            onSnapChange={onSnapChange}
            label={`Halte ${stopName}`}
            layer="overlay"
            visible={visible}
            enter
            onDismiss={onClose}
            onHidden={onHidden}
        >
            {children}
        </Sheet>,
        body,
    )
}

// --- HELPERS ---

const subscribeNever = () => () => {}

const clientBody = (): HTMLElement | null => document.body

const serverBody = (): HTMLElement | null => null
