// Minimal streaming reader for OpenStreetMap PBF files

import { closeSync, openSync, readSync } from "node:fs"
import { inflateSync } from "node:zlib"

/**
 * Minimal reader for OpenStreetMap PBF files (https://wiki.openstreetmap.org/wiki/PBF_Format):
 * just enough to stream ways with their tags and node coordinates. Hand-rolled protobuf decoding
 * keeps it dependency-free and fast enough for a few provinces (about a minute per pass).
 */

// --- CONSTANTS ---

const TEXT_DECODER = new TextDecoder()

// --- INTERFACES ---

export interface PbfWay {
    id: number
    refs: number[]
    tags: Map<string, string>
}

export interface PbfHandlers {
    /** Return false to skip decoding node blocks entirely (faster when only ways are needed). */
    wantNodes?: boolean
    wantWays?: boolean
    node?: (id: number, lat: number, lon: number) => void
    way?: (way: PbfWay) => void
}

// --- HELPERS ---

class Reader {
    pos: number
    constructor(
        readonly buf: Uint8Array,
        start = 0,
        readonly end = buf.length,
    ) {
        this.pos = start
    }

    get done(): boolean {
        return this.pos >= this.end
    }

    /** Unsigned varint as a JS number; exact up to 2^53, which covers OSM ids and coordinates. */
    varint(): number {
        const buf = this.buf
        let byte = buf[this.pos++] ?? 0
        if (byte < 0x80) return byte
        let result = byte & 0x7f
        let factor = 0x80
        for (;;) {
            byte = buf[this.pos++] ?? 0
            result += (byte & 0x7f) * factor
            if (byte < 0x80) return result
            factor *= 0x80
        }
    }

    svarint(): number {
        const n = this.varint()
        return n % 2 === 0 ? n / 2 : -(n + 1) / 2
    }

    bytes(): Reader {
        const length = this.varint()
        const start = this.pos
        this.pos += length
        return new Reader(this.buf, start, start + length)
    }

    skip(wireType: number): void {
        if (wireType === 0) this.varint()
        else if (wireType === 1) this.pos += 8
        else if (wireType === 2) {
            // Read the length first: `this.pos += this.varint()` would add it to the old position.
            const length = this.varint()
            this.pos += length
        } else if (wireType === 5) this.pos += 4
        else throw new Error(`Unsupported protobuf wire type ${wireType}`)
    }

    /** Packed repeated varints; plain (unpacked) encodings show up as single values. */
    packed(wireType: number, signed: boolean, into: number[]): void {
        if (wireType !== 2) {
            into.push(signed ? this.svarint() : this.varint())
            return
        }
        const inner = this.bytes()
        while (!inner.done) into.push(signed ? inner.svarint() : inner.varint())
    }
}

function decodeBlob(blob: Reader): Uint8Array {
    let raw: Uint8Array | null = null
    let zlib: Uint8Array | null = null
    while (!blob.done) {
        const key = blob.varint()
        const field = key >>> 3
        if (field === 1 || field === 3) {
            const part = blob.bytes()
            const bytes = blob.buf.subarray(part.pos, part.end)
            if (field === 1) raw = bytes
            else zlib = bytes
        } else {
            if (field === 4 || field === 7)
                throw new Error("Only zlib-compressed PBF blobs are supported")
            blob.skip(key & 7)
        }
    }
    if (raw) return raw
    if (zlib) return inflateSync(zlib)
    throw new Error("Empty PBF blob")
}

function decodeBlock(data: Uint8Array, handlers: PbfHandlers): void {
    const block = new Reader(data)
    const strings: string[] = []
    const groups: Reader[] = []
    let granularity = 100
    let latOffset = 0
    let lonOffset = 0
    while (!block.done) {
        const key = block.varint()
        const field = key >>> 3
        if (field === 1) {
            const table = block.bytes()
            while (!table.done) {
                const tableKey = table.varint()
                if (tableKey >>> 3 === 1) {
                    const s = table.bytes()
                    strings.push(TEXT_DECODER.decode(table.buf.subarray(s.pos, s.end)))
                } else table.skip(tableKey & 7)
            }
        } else if (field === 2) groups.push(block.bytes())
        else if (field === 17) granularity = block.varint()
        else if (field === 19) latOffset = block.svarint()
        else if (field === 20) lonOffset = block.svarint()
        else block.skip(key & 7)
    }

    const toLat = (value: number) => 1e-9 * (latOffset + granularity * value)
    const toLon = (value: number) => 1e-9 * (lonOffset + granularity * value)

    for (const group of groups) {
        while (!group.done) {
            const key = group.varint()
            const field = key >>> 3
            if (field === 2 && handlers.wantNodes && handlers.node) {
                decodeDense(group.bytes(), handlers.node, toLat, toLon)
            } else if (field === 1 && handlers.wantNodes && handlers.node) {
                decodeNode(group.bytes(), handlers.node, toLat, toLon)
            } else if (field === 3 && handlers.wantWays && handlers.way) {
                handlers.way(decodeWay(group.bytes(), strings))
            } else {
                group.skip(key & 7)
            }
        }
    }
}

function decodeDense(
    dense: Reader,
    onNode: (id: number, lat: number, lon: number) => void,
    toLat: (value: number) => number,
    toLon: (value: number) => number,
): void {
    const ids: number[] = []
    const lats: number[] = []
    const lons: number[] = []
    while (!dense.done) {
        const key = dense.varint()
        const field = key >>> 3
        if (field === 1) dense.packed(key & 7, true, ids)
        else if (field === 8) dense.packed(key & 7, true, lats)
        else if (field === 9) dense.packed(key & 7, true, lons)
        else dense.skip(key & 7)
    }
    let id = 0
    let lat = 0
    let lon = 0
    for (let i = 0; i < ids.length; i++) {
        id += ids[i] ?? 0
        lat += lats[i] ?? 0
        lon += lons[i] ?? 0
        onNode(id, toLat(lat), toLon(lon))
    }
}

function decodeNode(
    node: Reader,
    onNode: (id: number, lat: number, lon: number) => void,
    toLat: (value: number) => number,
    toLon: (value: number) => number,
): void {
    let id = 0
    let lat = 0
    let lon = 0
    while (!node.done) {
        const key = node.varint()
        const field = key >>> 3
        if (field === 1) id = node.svarint()
        else if (field === 8) lat = node.svarint()
        else if (field === 9) lon = node.svarint()
        else node.skip(key & 7)
    }
    onNode(id, toLat(lat), toLon(lon))
}

function decodeWay(way: Reader, strings: string[]): PbfWay {
    let id = 0
    const keys: number[] = []
    const values: number[] = []
    const deltas: number[] = []
    while (!way.done) {
        const key = way.varint()
        const field = key >>> 3
        if (field === 1) id = way.varint()
        else if (field === 2) way.packed(key & 7, false, keys)
        else if (field === 3) way.packed(key & 7, false, values)
        else if (field === 8) way.packed(key & 7, true, deltas)
        else way.skip(key & 7)
    }
    const tags = new Map<string, string>()
    for (let i = 0; i < keys.length; i++)
        tags.set(strings[keys[i] ?? 0] ?? "", strings[values[i] ?? 0] ?? "")
    const refs = new Array<number>(deltas.length)
    let ref = 0
    for (let i = 0; i < deltas.length; i++) {
        ref += deltas[i] ?? 0
        refs[i] = ref
    }
    return { id, refs, tags }
}

function readExactly(fd: number, length: number, position: number): Uint8Array | null {
    const buffer = Buffer.allocUnsafe(length)
    let read = 0
    while (read < length) {
        const n = readSync(fd, buffer, read, length - read, position + read)
        if (n === 0) return read === 0 ? null : buffer.subarray(0, read)
        read += n
    }
    return buffer
}

// --- SERVICE ---

/** Streams every data block of a PBF file through the handlers, synchronously. */
export function readPbf(path: string, handlers: PbfHandlers): void {
    const fd = openSync(path, "r")
    try {
        let position = 0
        for (;;) {
            const lengthBytes = readExactly(fd, 4, position)
            if (!lengthBytes || lengthBytes.length < 4) break
            const headerLength = Buffer.from(lengthBytes).readUInt32BE(0)
            position += 4
            const header = new Reader(readExactly(fd, headerLength, position) ?? new Uint8Array())
            position += headerLength
            let type = ""
            let dataSize = 0
            while (!header.done) {
                const key = header.varint()
                const field = key >>> 3
                if (field === 1) {
                    const s = header.bytes()
                    type = TEXT_DECODER.decode(header.buf.subarray(s.pos, s.end))
                } else if (field === 3) dataSize = header.varint()
                else header.skip(key & 7)
            }
            const blob = readExactly(fd, dataSize, position)
            position += dataSize
            if (!blob) throw new Error("Truncated PBF file")
            if (type !== "OSMData") continue
            decodeBlock(decodeBlob(new Reader(blob)), handlers)
        }
    } finally {
        closeSync(fd)
    }
}
