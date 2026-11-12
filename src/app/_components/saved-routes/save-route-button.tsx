// Saves the current pair of places, map points included, with a name and an optional fixed time

"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import {
    routeName,
    sameRoute,
    scheduleLabel,
    type SavedPlace,
    type SavedRoute,
} from "@/features/saved-routes/saved-routes"
import { useSavedRoutes } from "@/hooks/use-saved-routes"

import SaveRouteForm, { type RouteDraft } from "./save-route-form"

// --- INTERFACES ---

interface SaveRouteButtonProps {
    from: SavedPlace | null
    to: SavedPlace | null
    walk: boolean
}

// --- HELPERS ---

/** The route to store: the existing id when editing, else a new short random one. */
function buildRoute(
    draft: RouteDraft,
    from: SavedPlace,
    to: SavedPlace,
    walk: boolean,
    saved: SavedRoute | undefined,
): SavedRoute {
    return {
        id: saved?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: routeName(draft.name, from, to),
        from: { id: from.id, name: from.name },
        to: { id: to.id, name: to.name },
        walk,
        savedAt: Date.now(),
        schedule: draft.schedule,
    }
}

// --- COMPONENT ---

export default function SaveRouteButton({ from, to, walk }: SaveRouteButtonProps) {
    const { routes, save } = useSavedRoutes()
    const [editing, setEditing] = useState(false)
    const [failed, setFailed] = useState(false)

    if (!from || !to) return null
    const saved = routes.find((route) => sameRoute(route, from.id, to.id))

    const submit = async (draft: RouteDraft) => {
        const ok = await save(buildRoute(draft, from, to, walk, saved))
        setFailed(!ok)
        if (ok) setEditing(false)
    }

    if (editing) {
        return (
            <SaveRouteForm
                from={from}
                to={to}
                saved={saved}
                failed={failed}
                onSubmit={(draft) => void submit(draft)}
                onCancel={() => setEditing(false)}
            />
        )
    }

    return (
        <div className="flex items-center gap-3">
            <Button onClick={() => setEditing(true)} className="shrink-0">
                <Icon name={saved ? "edit" : "star"} size={20} />
                {saved ? "Route bewerken" : "Route bewaren"}
            </Button>
            {saved && (
                <span className="text-body-s text-muted">
                    Bewaard als “{saved.name}”
                    {saved.schedule ? `, opent vanzelf ${scheduleLabel(saved.schedule)}` : ""}
                </span>
            )}
        </div>
    )
}
