// Unit tests for the geocode service, against a fake PDOK Locatieserver

import assert from "node:assert"
import { describe, it } from "node:test"

import { createGeocodeService } from "@/features/geocode/geocode.service"

// --- HELPERS ---

const REGION = { minLat: 51.9, minLon: 4.6, maxLat: 52.32, maxLon: 5.65 }

const ODEGRACHT = {
    straatnaam: "Oudegracht",
    huisnummer: 10,
    huisletter: "A",
    postcode: "3511AM",
    woonplaatsnaam: "Utrecht",
    centroide_ll: "POINT(5.11651124 52.0959503)",
}

const MAASTRICHT = {
    straatnaam: "Markt",
    huisnummer: 1,
    woonplaatsnaam: "Maastricht",
    centroide_ll: "POINT(5.6909 50.8514)",
}

function fakeFetch(docs: unknown[], status = 200) {
    const urls: string[] = []
    const fetch = async (url: string | URL | Request) => {
        urls.push(String(url))
        return new Response(JSON.stringify({ response: { docs } }), { status })
    }
    return { fetch: fetch as typeof globalThis.fetch, urls }
}

const service = (fetch: typeof globalThis.fetch, baseUrl = "https://pdok.test") =>
    createGeocodeService({ baseUrl, userAgent: "test", region: REGION, fetch })

// --- TESTS ---

describe("searchAddresses", () => {
    it("reads PDOK addresses as name, postcode and point", async () => {
        const { fetch } = fakeFetch([ODEGRACHT])
        assert.deepStrictEqual(await service(fetch).searchAddresses("oudegracht 10"), [
            {
                name: "Oudegracht 10A, Utrecht",
                postcode: "3511AM",
                lat: 52.0959503,
                lon: 5.11651124,
            },
        ])
    })

    it("leaves out addresses outside the timetable's region", async () => {
        const { fetch } = fakeFetch([MAASTRICHT, ODEGRACHT])
        const names = (await service(fetch).searchAddresses("markt")).map((a) => a.name)
        assert.deepStrictEqual(names, ["Oudegracht 10A, Utrecht"])
    })

    it("skips a document it cannot read", async () => {
        const { fetch } = fakeFetch([{ weergavenaam: "Utrecht" }, ODEGRACHT])
        assert.strictEqual((await service(fetch).searchAddresses("utrecht")).length, 1)
    })

    it("returns nothing when PDOK fails", async () => {
        const { fetch } = fakeFetch([], 503)
        assert.deepStrictEqual(await service(fetch).searchAddresses("oudegracht"), [])
    })

    it("asks PDOK once for a repeated query", async () => {
        const { fetch, urls } = fakeFetch([ODEGRACHT])
        const geocoder = service(fetch)
        await geocoder.searchAddresses("oudegracht")
        await geocoder.searchAddresses("oudegracht")
        assert.strictEqual(urls.length, 1)
    })

    it("does not search without a base URL", async () => {
        const { fetch, urls } = fakeFetch([ODEGRACHT])
        assert.deepStrictEqual(await service(fetch, "").searchAddresses("oudegracht"), [])
        assert.strictEqual(urls.length, 0)
    })
})

describe("addressAt", () => {
    it("asks for the nearest address within the distance", async () => {
        const { fetch, urls } = fakeFetch([ODEGRACHT])
        const address = await service(fetch).addressAt({ lat: 52.09595, lon: 5.11651 }, 25)
        assert.strictEqual(address?.name, "Oudegracht 10A, Utrecht")
        assert.match(urls[0] ?? "", /\/reverse\?.*distance=25/)
    })

    it("returns null when no house is that close", async () => {
        const { fetch } = fakeFetch([])
        assert.strictEqual(await service(fetch).addressAt({ lat: 52.1, lon: 5.1 }, 25), null)
    })
})
