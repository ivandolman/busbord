// Zod schemas for PDOK Locatieserver responses (Dutch address register) and the address we keep

import { z } from "zod"

// --- SCHEMAS ---

/** "POINT(5.11649984 52.09597701)": WGS84, longitude first. */
const WKT_POINT = /^POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/

const WktPointSchema = z
    .string()
    .regex(WKT_POINT)
    .transform((wkt) => {
        const [, lon, lat] = WKT_POINT.exec(wkt) ?? []
        return { lat: Number(lat), lon: Number(lon) }
    })

const PdokDocSchema = z.object({
    straatnaam: z.string(),
    huisnummer: z.number(),
    huisletter: z.string().optional(),
    huisnummertoevoeging: z.string().optional(),
    postcode: z.string().optional(),
    woonplaatsnaam: z.string(),
    centroide_ll: WktPointSchema,
})

/** A response with one unreadable document keeps the others. */
export const PdokResponseSchema = z.object({
    response: z.object({
        docs: z.array(z.unknown()).transform((docs) =>
            docs.flatMap((doc) => {
                const parsed = PdokDocSchema.safeParse(doc)
                return parsed.success ? [toAddress(parsed.data)] : []
            }),
        ),
    }),
})

export interface Address {
    /** "Oudegracht 10A, Utrecht": what the search field shows once chosen. */
    name: string
    /** "3511AM": shown under the address in the suggestions; null when the register has none. */
    postcode: string | null
    lat: number
    lon: number
}

// --- HELPERS ---

function toAddress(doc: z.infer<typeof PdokDocSchema>): Address {
    const suffix = doc.huisnummertoevoeging ? `-${doc.huisnummertoevoeging}` : ""
    const number = `${doc.huisnummer}${doc.huisletter ?? ""}${suffix}`
    return {
        name: `${doc.straatnaam} ${number}, ${doc.woonplaatsnaam}`,
        postcode: doc.postcode ?? null,
        lat: doc.centroide_ll.lat,
        lon: doc.centroide_ll.lon,
    }
}
