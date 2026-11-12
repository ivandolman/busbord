// Unit tests for saved routes: parsing, replacing, naming and schedules

import assert from "node:assert"
import { describe, it } from "node:test"

import {
    isScheduledAt,
    parseSavedRoutes,
    routeName,
    scheduledRoute,
    scheduleLabel,
    withRoute,
    type SavedRoute,
} from "@/features/saved-routes/saved-routes"

describe("saved routes", () => {
    const route = (id: string, from: string, to: string): SavedRoute => ({
        id,
        name: id,
        from: { id: from, name: "A" },
        to: { id: to, name: "B" },
        walk: true,
        savedAt: 1,
        schedule: null,
    })

    it("keeps valid routes, map points included, and drops anything else", () => {
        const raw = JSON.stringify([
            route("home", "@52.08540,5.17240", "stoparea:1"),
            { id: "bad", name: "x", from: { id: "<script>" }, to: { id: "stoparea:2" } },
            "nonsense",
        ])
        assert.deepStrictEqual(
            parseSavedRoutes(raw).map((entry) => entry.id),
            ["home"],
        )
        assert.deepStrictEqual(parseSavedRoutes("{not json"), [])
        assert.deepStrictEqual(parseSavedRoutes(null), [])
    })

    it("replaces a saved trip instead of duplicating it and names unnamed routes", () => {
        const routes = withRoute(
            [route("old", "stoparea:1", "stoparea:2")],
            route("new", "stoparea:1", "stoparea:2"),
        )
        assert.deepStrictEqual(
            routes.map((entry) => entry.id),
            ["new"],
        )
        assert.strictEqual(
            routeName("  ", { id: "a", name: "Thuis" }, { id: "b", name: "Werk" }),
            "Thuis → Werk",
        )
    })
})

describe("route schedules", () => {
    const at = (day: number, time: string) => {
        // 2 November 2026 is a Monday; day 0 = Sunday the 8th.
        const date = new Date(
            2026,
            10,
            day === 0 ? 8 : 1 + day,
            Number(time.slice(0, 2)),
            Number(time.slice(3)),
        )
        return date
    }

    it("matches days and times, including windows past midnight", () => {
        const work = { days: [1, 2, 3, 4, 5], start: "07:30", end: "09:00" }
        assert.strictEqual(isScheduledAt(work, at(1, "08:15")), true)
        assert.strictEqual(isScheduledAt(work, at(1, "09:01")), false)
        assert.strictEqual(isScheduledAt(work, at(6, "08:15")), false)

        const night = { days: [5], start: "23:00", end: "01:00" }
        assert.strictEqual(isScheduledAt(night, at(5, "23:30")), true)
        assert.strictEqual(isScheduledAt(night, at(6, "00:30")), true)
        assert.strictEqual(isScheduledAt(night, at(5, "00:30")), false)
    })

    it("finds the route for now and labels schedules the Dutch way", () => {
        const route = (id: string, schedule: SavedRoute["schedule"]): SavedRoute => ({
            id,
            name: id,
            from: { id: "stoparea:1", name: "A" },
            to: { id: `stoparea:${id}`, name: "B" },
            walk: true,
            savedAt: 0,
            schedule,
        })
        const routes = [
            route("morning", { days: [1, 2, 3, 4, 5], start: "07:30", end: "09:00" }),
            route("afternoon", { days: [1, 2, 3, 4, 5], start: "16:30", end: "18:00" }),
        ]
        assert.strictEqual(scheduledRoute(routes, at(3, "17:00"))?.id, "afternoon")
        assert.strictEqual(scheduledRoute(routes, at(3, "12:00")), null)
        assert.strictEqual(
            scheduleLabel({ days: [1, 2, 3, 4, 5], start: "07:30", end: "09:00" }),
            "ma–vr 07:30–09:00",
        )
        assert.strictEqual(
            scheduleLabel({ days: [1, 3, 5], start: "16:30", end: "18:00" }),
            "ma, wo, vr 16:30–18:00",
        )
        assert.strictEqual(
            scheduleLabel({ days: [0, 1, 2, 3, 4, 5, 6], start: "08:00", end: "09:00" }),
            "elke dag 08:00–09:00",
        )
        // A stored schedule with nonsense in it is dropped, the route itself kept.
        const raw = JSON.stringify([
            { ...route("x", null), schedule: { days: [9], start: "25:00", end: "x" } },
        ])
        assert.strictEqual(parseSavedRoutes(raw)[0]?.schedule, null)
    })
})
