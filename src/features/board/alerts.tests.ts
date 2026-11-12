// Unit tests for matching service alerts to the lines and stops on a board

import assert from "node:assert"
import { describe, it } from "node:test"

import { matchAlerts } from "@/features/board/alerts"

describe("matchAlerts", () => {
    const alert = (
        id: string,
        entities: { routeId: string | null; stopId: string | null }[],
        header = id,
    ) => ({
        id,
        header,
        description: "",
        periods: [{ start: 0, end: 2000 }],
        entities,
    })

    it("keeps alerts about our lines or our stops, active now, once per text", () => {
        const alerts = [
            alert("line", [{ routeId: "r1", stopId: null }]),
            alert("line at our stop", [{ routeId: "r1", stopId: "s1" }]),
            alert("line at another stop", [{ routeId: "r1", stopId: "s9" }]),
            alert("our stop", [{ routeId: null, stopId: "s1" }]),
            alert("other line", [{ routeId: "r2", stopId: null }]),
            alert("again", [{ routeId: "r1", stopId: null }], "line"),
            {
                ...alert("over", [{ routeId: "r1", stopId: null }]),
                periods: [{ start: 0, end: 500 }],
            },
        ]
        const ids = matchAlerts(alerts, new Set(["r1"]), new Set(["s1"]), 1000).map((a) => a.id)
        assert.deepStrictEqual(ids, ["line", "line at our stop", "our stop"])
    })
})
