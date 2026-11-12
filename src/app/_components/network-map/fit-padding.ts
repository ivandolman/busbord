// fitBounds padding that keeps a fitted view clear of what covers the map on a phone

import type L from "leaflet"

// --- HELPERS ---

/**
 * fitBounds padding that keeps the result clear of what covers the map on a phone: the search
 * bar on top (--map-top) and the bottom sheet (--sheet-h, kept up to date by the sheet).
 */
export function fitPadding(
    base: number,
): Pick<L.FitBoundsOptions, "paddingTopLeft" | "paddingBottomRight"> {
    const style = getComputedStyle(document.documentElement)
    const top = parseFloat(style.getPropertyValue("--map-top")) || 0
    const sheet = parseFloat(style.getPropertyValue("--sheet-h")) || 0
    // A sheet that covers most of the screen is open on purpose; fit above its peek height then.
    const viewport = parseFloat(style.getPropertyValue("--app-h")) || window.innerHeight
    const bottom = Math.min(sheet, viewport * 0.5)
    return { paddingTopLeft: [base, base + top], paddingBottomRight: [base, base + bottom] }
}
