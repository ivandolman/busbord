// Unit tests for the user data service on an in-memory SQLite store

import assert from "node:assert"
import { DatabaseSync } from "node:sqlite"
import { describe, it } from "node:test"

import type { SavedRoute } from "@/features/saved-routes/saved-routes"
import { createUserDataService, parseWalkTieMinutes } from "@/features/user-data/user-data.service"

// --- HELPERS ---

const route = (id: string, fromId: string, toId: string, savedAt: number): SavedRoute => ({
    id,
    name: `Route ${id}`,
    from: { id: fromId, name: "A" },
    to: { id: toId, name: "B" },
    walk: true,
    savedAt,
    schedule: { days: [1, 2, 3, 4, 5], start: "07:30", end: "09:00" },
})

// --- TESTS ---

describe("UserStore", () => {
    it("keeps routes newest first, replaces the same trip and deletes", () => {
        const store = createUserDataService(new DatabaseSync(":memory:"))
        store.saveRoute(route("a", "stoparea:1", "stoparea:2", 1))
        store.saveRoute(route("b", "stoparea:3", "@52.09848,5.12513", 2))
        assert.deepStrictEqual(
            store.routes().map((r) => r.id),
            ["b", "a"],
        )
        assert.deepStrictEqual(store.routes()[0]?.schedule, {
            days: [1, 2, 3, 4, 5],
            start: "07:30",
            end: "09:00",
        })

        // Same pair under a new id replaces the old entry.
        const routes = store.saveRoute(route("c", "stoparea:1", "stoparea:2", 3))
        assert.deepStrictEqual(
            routes.map((r) => r.id),
            ["c", "b"],
        )

        assert.deepStrictEqual(
            store.deleteRoute("b").map((r) => r.id),
            ["c"],
        )
    })

    it("stores the walking tie, with a default", () => {
        const store = createUserDataService(new DatabaseSync(":memory:"))
        assert.strictEqual(store.settings().walkTieMinutes, 2)
        assert.strictEqual(store.saveSettings({ walkTieMinutes: 5 }).walkTieMinutes, 5)
        assert.strictEqual(store.settings().mapStyle, "calm")
        assert.deepStrictEqual(store.saveSettings({ mapStyle: "detailed" }), {
            walkTieMinutes: 5,
            mapStyle: "detailed",
            maxWalkMinutes: 12,
        })
        assert.strictEqual(store.saveSettings({ maxWalkMinutes: 8 }).maxWalkMinutes, 8)
    })

    it("accepts only whole minutes in range", () => {
        assert.strictEqual(parseWalkTieMinutes("3"), 3)
        assert.strictEqual(parseWalkTieMinutes(0), 0)
        assert.strictEqual(parseWalkTieMinutes("-1"), null)
        assert.strictEqual(parseWalkTieMinutes("1.5"), null)
        assert.strictEqual(parseWalkTieMinutes("99"), null)
        assert.strictEqual(parseWalkTieMinutes(null), null)
        assert.strictEqual(parseWalkTieMinutes(""), null)
    })
})
