// The saved routes as chips; one tap opens the board again

"use client"

import { cva } from "class-variance-authority"

import { Icon } from "@/components/ui/icon"
import { sameRoute, scheduleLabel, type SavedRoute } from "@/features/saved-routes/saved-routes"
import { useSavedRoutes } from "@/hooks/use-saved-routes"

// --- STYLING ---

const chipVariants = cva(
    "text-body-s flex max-w-full items-center overflow-hidden rounded-[10px] border",
    {
        variants: {
            /** The route on screen. */
            active: {
                true: "border-dark bg-dark text-on-dark",
                false: "border-border bg-background text-foreground",
            },
        },
        defaultVariants: {
            active: false,
        },
    },
)

// --- INTERFACES ---

interface SavedRouteListProps {
    fromId: string | null
    toId: string | null
    onOpen: (route: SavedRoute) => void
}

// --- COMPONENT ---

export default function SavedRouteList({ fromId, toId, onOpen }: SavedRouteListProps) {
    const { routes, remove } = useSavedRoutes()
    if (routes.length === 0) return null

    return (
        <section aria-label="Mijn routes" className="flex flex-col gap-2">
            <h2 className="text-body-s text-muted">Mijn routes</h2>
            <ul className="flex flex-wrap gap-2">
                {routes.map((route) => {
                    const active = sameRoute(route, fromId, toId)
                    return (
                        <li key={route.id} className={chipVariants({ active })}>
                            <button
                                type="button"
                                onClick={() => onOpen(route)}
                                aria-current={active ? "true" : undefined}
                                title={`${route.from.name} → ${route.to.name}`}
                                className="min-h-11 min-w-0 px-3 py-1.5 text-left"
                            >
                                <span className="block truncate font-semibold">{route.name}</span>
                                {route.schedule && (
                                    <span className="block truncate">
                                        {scheduleLabel(route.schedule)}
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => void remove(route.id)}
                                aria-label={`Verwijder ${route.name}`}
                                className="flex h-11 w-9 shrink-0 items-center justify-center"
                            >
                                <Icon name="x" size={16} />
                            </button>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
