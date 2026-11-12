// Registers the service worker for offline use and "Vertrek nu" notifications

"use client"

import { useEffect } from "react"

// --- COMPONENT ---

/** Production builds only: in development a caching worker would serve stale code between edits. */
export default function ServiceWorker() {
    useEffect(() => {
        if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
        navigator.serviceWorker.register("/sw.js").catch(() => {
            // Without it the app still works, only not offline.
        })
    }, [])
    return null
}
