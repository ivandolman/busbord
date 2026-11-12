// Name and optional fixed time of a route being saved or edited

"use client"

import { useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    routeName,
    type RouteSchedule,
    type SavedPlace,
    type SavedRoute,
} from "@/features/saved-routes/saved-routes"

import ScheduleFields from "./schedule-fields"

// --- CONSTANTS ---

const WEEKDAYS = [1, 2, 3, 4, 5]

// --- INTERFACES ---

export interface RouteDraft {
    name: string
    schedule: RouteSchedule | null
}

interface SaveRouteFormProps {
    from: SavedPlace
    to: SavedPlace
    /** The route as saved before, when editing. */
    saved: SavedRoute | undefined
    failed: boolean
    onSubmit: (draft: RouteDraft) => void
    onCancel: () => void
}

// --- HELPERS ---

/** A sensible first window: the coming hour and a half on weekdays, starting on a quarter. */
function defaultSchedule(now = new Date()): RouteSchedule {
    const start = Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) * 15
    const end = Math.min(start + 90, 23 * 60 + 59)
    const clock = (minutes: number) =>
        `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
    return { days: WEEKDAYS, start: clock(start), end: clock(end) }
}

// --- COMPONENT ---

export default function SaveRouteForm({
    from,
    to,
    saved,
    failed,
    onSubmit,
    onCancel,
}: SaveRouteFormProps) {
    const id = useId()
    const [name, setName] = useState(saved?.name ?? "")
    const [schedule, setSchedule] = useState<RouteSchedule | null>(saved?.schedule ?? null)
    const scheduleInvalid =
        schedule !== null && (schedule.days.length === 0 || schedule.start === schedule.end)

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (scheduleInvalid) return
        onSubmit({ name, schedule })
    }

    return (
        <form
            onSubmit={submit}
            className="border-border flex flex-col gap-3 rounded-2xl border p-4"
        >
            <div className="space-y-1">
                <label htmlFor={`${id}-name`} className="text-body-s text-muted block">
                    Naam van de route
                </label>
                <Input
                    id={`${id}-name`}
                    name="route-name"
                    autoFocus
                    maxLength={60}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={routeName("", from, to)}
                    className="w-full"
                />
            </div>

            <fieldset className="space-y-2">
                <legend className="sr-only">Vaste reis</legend>
                <label className="text-body-m flex min-h-11 items-center gap-2 font-semibold">
                    <input
                        type="checkbox"
                        name="scheduled"
                        checked={schedule !== null}
                        onChange={(event) =>
                            setSchedule(
                                event.target.checked
                                    ? (saved?.schedule ?? defaultSchedule())
                                    : null,
                            )
                        }
                        className="size-4"
                    />
                    Vaste reis: opent vanzelf op deze tijden
                </label>
                {schedule && (
                    <ScheduleFields
                        schedule={schedule}
                        invalid={scheduleInvalid}
                        onChange={setSchedule}
                    />
                )}
            </fieldset>

            {failed && (
                <p className="text-body-s text-error">Opslaan lukte niet. Probeer het opnieuw.</p>
            )}
            <div className="flex gap-2">
                <Button
                    type="submit"
                    variant="primary"
                    disabled={scheduleInvalid}
                    className="flex-1"
                >
                    Opslaan
                </Button>
                <Button onClick={onCancel} className="flex-1">
                    Annuleren
                </Button>
            </div>
        </form>
    )
}
