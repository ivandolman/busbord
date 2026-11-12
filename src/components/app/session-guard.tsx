// Sends the user to the login page when the session runs out while the app is open

"use client"

import { useEffect } from "react"

// --- COMPONENT ---

/**
 * When the session runs out, API calls answer 401 with X-Auth-Required. Instead of showing errors
 * everywhere, go to the login page and come back here afterwards.
 */
export default function SessionGuard() {
    useEffect(() => {
        const original = window.fetch
        let leaving = false
        window.fetch = async (...args: Parameters<typeof fetch>) => {
            const response = await original(...args)
            if (
                !leaving &&
                response.status === 401 &&
                response.headers.get("X-Auth-Required") === "1"
            ) {
                leaving = true
                const next = window.location.pathname + window.location.search
                // A full page load on purpose, not router.push: it drops everything this tab holds
                // in memory from the ended session and starts the guard afresh after logging in.
                const login = new URL(
                    `/login?${new URLSearchParams({ next })}`,
                    window.location.origin,
                )
                window.location.assign(login)
            }
            return response
        }
        return () => {
            window.fetch = original
        }
    }, [])
    return null
}
