// The chosen places and walk switch, kept in the URL so a board can be bookmarked or shared

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

// --- HELPERS ---

export function useRouteParams() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const fromId = searchParams.get("from")
    const toId = searchParams.get("to")
    const walk = searchParams.get("walk") !== "0"

    /** Sets (string) or removes (null) query parameters, without a scroll or history entry. */
    const updateUrl = useCallback(
        (changes: Record<string, string | null>) => {
            const next = new URLSearchParams(searchParams)
            for (const [key, value] of Object.entries(changes)) {
                if (value === null) next.delete(key)
                else next.set(key, value)
            }
            const query = next.toString()
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
        },
        [pathname, router, searchParams],
    )

    return { fromId, toId, walk, updateUrl }
}
