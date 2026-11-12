// Measures the box fixed elements are laid out in, and the safe areas at its top and bottom

import { useEffect, useLayoutEffect, useRef, useState } from "react"

// --- INTERFACES ---

export interface FixedViewport {
    height: number
    safeTop: number
    safeBottom: number
}

// --- CONSTANTS ---

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

// --- HELPERS ---

/**
 * Attach the returned ref to an invisible `fixed inset-0` element padded with the safe-area
 * insets. Measured, not window.innerHeight or dvh: on iPhone those differ from the box a fixed
 * element gets (Safari's toolbars, home-screen app), so a sheet and its snaps would not line up.
 * Measured before paint, so a sheet that slides in starts below the screen, not at a guess.
 */
export function useFixedViewport() {
    const probe = useRef<HTMLDivElement>(null)
    const [viewport, setViewport] = useState<FixedViewport>({
        height: 0,
        safeTop: 0,
        safeBottom: 0,
    })

    useIsomorphicLayoutEffect(() => {
        const element = probe.current
        if (!element) return
        const sync = () => {
            const style = getComputedStyle(element)
            setViewport({
                height: element.clientHeight,
                safeTop: parseFloat(style.paddingTop) || 0,
                safeBottom: parseFloat(style.paddingBottom) || 0,
            })
        }
        sync()
        const observer = new ResizeObserver(sync)
        observer.observe(element)
        window.addEventListener("orientationchange", sync)
        return () => {
            observer.disconnect()
            window.removeEventListener("orientationchange", sync)
        }
    }, [])

    return { probe, viewport }
}
