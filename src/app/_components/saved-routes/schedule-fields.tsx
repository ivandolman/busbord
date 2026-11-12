// Days and time window of a regular trip ("Vaste reis"), inside the save-route form

"use client"

import { useId } from "react"

import { cva } from "class-variance-authority"

import { Input } from "@/components/ui/input"
import { DAY_SHORT, WEEK, type RouteSchedule } from "@/features/saved-routes/saved-routes"

// --- STYLING ---

const dayVariants = cva("text-body-s h-11 w-11 rounded-full font-semibold", {
    variants: {
        selected: {
            true: "bg-dark text-on-dark",
            false: "bg-surface text-foreground",
        },
    },
    defaultVariants: {
        selected: false,
    },
})

// --- INTERFACES ---

interface ScheduleFieldsProps {
    schedule: RouteSchedule
    invalid: boolean
    onChange: (schedule: RouteSchedule) => void
}

// --- HELPERS ---

function toggleDay(schedule: RouteSchedule, day: number): RouteSchedule {
    const days = schedule.days.includes(day)
        ? schedule.days.filter((d) => d !== day)
        : [...schedule.days, day].sort()
    return { ...schedule, days }
}

// --- COMPONENT ---

export default function ScheduleFields({ schedule, invalid, onChange }: ScheduleFieldsProps) {
    const id = useId()
    return (
        <div className="space-y-2 pl-6">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Dagen">
                {WEEK.map((day) => {
                    const on = schedule.days.includes(day)
                    return (
                        <button
                            key={day}
                            type="button"
                            aria-pressed={on}
                            onClick={() => onChange(toggleDay(schedule, day))}
                            className={dayVariants({ selected: on })}
                        >
                            {DAY_SHORT[day]}
                        </button>
                    )
                })}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor={`${id}-start`} className="text-muted">
                    van
                </label>
                <Input
                    id={`${id}-start`}
                    name="start"
                    type="time"
                    required
                    value={schedule.start}
                    onChange={(event) => onChange({ ...schedule, start: event.target.value })}
                />
                <label htmlFor={`${id}-end`} className="text-muted">
                    tot
                </label>
                <Input
                    id={`${id}-end`}
                    name="end"
                    type="time"
                    required
                    value={schedule.end}
                    onChange={(event) => onChange({ ...schedule, end: event.target.value })}
                />
            </div>
            {invalid && (
                <p className="text-body-s text-error">
                    Kies minstens één dag en twee verschillende tijden.
                </p>
            )}
            <p className="text-body-s text-muted">
                Open je de app in dit tijdvak zonder route, dan staat deze route meteen klaar.
            </p>
        </div>
    )
}
