// Light/dark choice of this device, kept in localStorage and applied as data-theme on <html>

import { useCallback, useSyncExternalStore } from "react"

import { THEME_KEY, type Theme } from "@/lib/theme"

// --- INTERFACES ---

export type { Theme }

// --- HELPERS ---

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function read(): Theme {
    try {
        const stored = localStorage.getItem(THEME_KEY)
        return stored === "light" || stored === "dark" ? stored : "auto"
    } catch {
        return "auto"
    }
}

export function useTheme(): [Theme, (theme: Theme) => void] {
    const theme = useSyncExternalStore(subscribe, read, () => "auto" as Theme)
    const setTheme = useCallback((next: Theme) => {
        try {
            if (next === "auto") localStorage.removeItem(THEME_KEY)
            else localStorage.setItem(THEME_KEY, next)
        } catch {
            // Private mode: the choice holds until the page is closed.
        }
        if (next === "auto") delete document.documentElement.dataset.theme
        else document.documentElement.dataset.theme = next
        for (const listener of listeners) listener()
    }, [])
    return [theme, setTheme]
}
