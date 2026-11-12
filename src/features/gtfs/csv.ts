// Streaming CSV reader for GTFS tables

import { createInterface } from "node:readline"
import type { Readable } from "node:stream"

// --- HELPERS ---

/** Splits one CSV record into fields, honouring RFC 4180 quoting. */
export function parseCsvLine(line: string): string[] {
    if (!line.includes('"')) return line.split(",")

    const fields: string[] = []
    let field = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (inQuotes) {
            if (char === '"') {
                if (line[i + 1] === '"') {
                    field += '"'
                    i++
                } else {
                    inQuotes = false
                }
            } else {
                field += char
            }
        } else if (char === '"') {
            inQuotes = true
        } else if (char === ",") {
            fields.push(field)
            field = ""
        } else {
            field += char
        }
    }
    fields.push(field)
    return fields
}

/**
 * Streams a GTFS table and calls `onRow` with the requested columns, in the requested order.
 * Columns missing from the file come back as empty strings, since most GTFS columns are optional.
 *
 * Records are assumed to fit on one line. GTFS allows quoted line breaks, but they do not occur
 * in the tables we read, and line-based reading is what keeps a 1 GB stop_times.txt fast.
 */
export function forEachCsvRow(
    stream: Readable,
    columns: readonly string[],
    onRow: (values: string[]) => void,
): Promise<number> {
    return new Promise((resolve, reject) => {
        const lines = createInterface({ input: stream, crlfDelay: Infinity })
        let indexes: number[] | null = null
        let count = 0

        lines.on("line", (rawLine) => {
            try {
                if (indexes === null) {
                    const header = parseCsvLine(rawLine.replace(/^﻿/, "")).map((name) =>
                        name.trim(),
                    )
                    indexes = columns.map((column) => header.indexOf(column))
                    return
                }
                if (rawLine.length === 0) return
                const fields = parseCsvLine(rawLine)
                const values = new Array<string>(indexes.length)
                for (let i = 0; i < indexes.length; i++) {
                    const index = indexes[i] ?? -1
                    values[i] = index >= 0 ? (fields[index] ?? "") : ""
                }
                count++
                onRow(values)
            } catch (error) {
                lines.close()
                stream.destroy()
                reject(error)
            }
        })
        lines.on("close", () => resolve(count))
        stream.on("error", reject)
    })
}
