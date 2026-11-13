// Integration tests for finding the train station near a stop and its platforms as places,
// on a small in-memory timetable

import assert from "node:assert"
import { DatabaseSync } from "node:sqlite"
import { describe, it } from "node:test"

import { TimetableRepository } from "@/features/board/board.repository"
import { createBoardService } from "@/features/board/board.service"
import { CREATE_TABLES } from "@/features/gtfs/gtfs-tables"

// --- HELPERS ---

/** A station with trains at platforms 5 and 12, an unused platform 12a, and a bus stop next door. */
function timetableDb(): DatabaseSync {
    const db = new DatabaseSync(":memory:")
    db.exec(CREATE_TABLES)
    const insert = (sql: string, ...rows: (string | number)[][]) => {
        const statement = db.prepare(sql)
        for (const row of rows) statement.run(...row)
    }
    insert(
        "INSERT INTO areas (area_id, name, search_name, lat, lon, departures) VALUES (?, ?, ?, ?, ?, ?)",
        ["station", "Utrecht Centraal", "utrecht centraal", 52.09, 5.11, 10],
        ["bus", "Utrecht, CS Centrumzijde", "utrecht cs centrumzijde", 52.0905, 5.1115, 10],
    )
    insert(
        "INSERT INTO stops (stop_id, area_id, name, platform, lat, lon) VALUES (?, ?, ?, ?, ?, ?)",
        ["p12", "station", "Utrecht Centraal", "12", 52.0898, 5.1095],
        ["p5", "station", "Utrecht Centraal", "5", 52.0901, 5.1102],
        ["p12a", "station", "Utrecht Centraal", "12a", 52.0906, 5.1088],
        ["b1", "bus", "Utrecht, CS Centrumzijde", "B1", 52.0905, 5.1115],
    )
    insert(
        "INSERT INTO routes (route_id, agency_id, short_name, long_name, type) VALUES (?, ?, ?, ?, ?)",
        ["ic", "NS", "IC", "Intercity", 2],
        ["bus28", "QBUZZ", "28", "Bus 28", 3],
    )
    insert(
        "INSERT INTO trips (trip_id, route_id, service_id, headsign) VALUES (?, ?, ?, ?)",
        ["t1", "ic", "s", "Amsterdam"],
        ["t2", "bus28", "s", "Zeist"],
    )
    insert(
        "INSERT INTO stop_times (trip_id, seq, stop_id, arr, dep, pickup, dropoff) VALUES (?, ?, ?, 0, 0, 0, 0)",
        ["t1", 1, "p12"],
        ["t1", 2, "p5"],
        ["t2", 1, "b1"],
    )
    return db
}

const timetable = () => new TimetableRepository(timetableDb())

// --- TESTS ---

describe("trainStationNear", () => {
    const repository = timetable()

    it("lists the platforms trains call at, in number order", () => {
        const station = repository.trainStationNear(52.0905, 5.1115, 500)
        assert.strictEqual(station?.name, "Utrecht Centraal")
        assert.deepStrictEqual(
            station?.platforms.map((platform) => platform.code),
            ["5", "12"],
        )
    })

    it("finds nothing when no station is near", () => {
        assert.strictEqual(repository.trainStationNear(52.2, 5.3, 500), null)
    })
})

describe("platforms as places", () => {
    const db = timetableDb()
    const service = createBoardService({
        database: () => db,
        walker: () => null,
        geocoder: { searchAddresses: async () => [], addressAt: async () => null },
    })

    it("finds the station near a stop area or a map point", () => {
        assert.strictEqual(service.getStation("bus")?.name, "Utrecht Centraal")
        assert.strictEqual(service.getStation("@52.09050,5.11150")?.platforms.length, 2)
        assert.strictEqual(service.getStation("@52.20000,5.30000"), null)
    })

    it("names a point on a platform after the platform", async () => {
        assert.strictEqual(
            (await service.getPlace("@52.09010,5.11020")).name,
            "Utrecht Centraal, spoor 5",
        )
    })

    it("offers the typed platform first in the search", async () => {
        assert.deepStrictEqual((await service.searchStops("utrecht spoor 12"))[0], {
            id: "@52.08980,5.10950",
            name: "Utrecht Centraal, spoor 12",
            kind: "platform",
        })
        assert.ok(
            (await service.searchStops("utrecht spoor 7")).every(
                (stop) => !stop.name.includes("spoor"),
            ),
        )
    })
})
