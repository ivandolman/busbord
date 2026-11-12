// Shared metadata builder, so every route describes itself through one helper

import type { Metadata } from "next"

// --- INTERFACES ---

interface BuildMetadataOptions {
    title: string
    description?: string
    /** Keeps the page out of search results (login and other private routes). */
    noindex?: boolean
}

// --- HELPERS ---

export function buildMetadata({
    title,
    description,
    noindex = false,
}: BuildMetadataOptions): Metadata {
    return {
        title,
        ...(description ? { description } : {}),
        ...(noindex ? { robots: { index: false } } : {}),
    }
}
