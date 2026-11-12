// Read-only handle on the timetable database, reopened when the importer swaps the file

import { statSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

import { config } from "./config"

// --- SERVICE ---

export class DatabaseMissingError extends Error {
    constructor(path: string) {
        super(`No timetable database at ${path}. Run "pnpm gtfs:demo" or "pnpm gtfs:import" first.`)
        this.name = "DatabaseMissingError"
    }
}

let cached: { db: DatabaseSync; modified: number } | null = null

/**
 * Read-only handle on the timetable. The importer swaps the file atomically, so the handle is
 * reopened whenever the file's modification time changes.
 */
export function getDatabase(): DatabaseSync {
    let modified: number
    try {
        modified = statSync(config.dbPath).mtimeMs
    } catch {
        throw new DatabaseMissingError(config.dbPath)
    }
    if (cached && cached.modified === modified) return cached.db
    cached?.db.close()
    const db = new DatabaseSync(config.dbPath, { readOnly: true })
    cached = { db, modified }
    return db
}
