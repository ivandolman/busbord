// Unit tests for straight walking lines across squares

import assert from "node:assert"
import { describe, it } from "node:test"

import { areaChords } from "@/features/roads/area-chords"

// --- HELPERS ---

type Point = [number, number]

/** A square of about 110 m, corners counter-clockwise from the south-west, with mid-edge points. */
const square: Point[] = [
    [52.0, 5.0],
    [52.0, 5.0008],
    [52.0, 5.0016],
    [52.0005, 5.0016],
    [52.001, 5.0016],
    [52.001, 5.0008],
    [52.001, 5.0],
    [52.0005, 5.0],
]

/** An L-shape: the square with its north-east quarter cut away. */
const lShape: Point[] = [
    [52.0, 5.0],
    [52.0, 5.0016],
    [52.0005, 5.0016],
    [52.0005, 5.0008],
    [52.001, 5.0008],
    [52.001, 5.0],
]

// --- TESTS ---

describe("areaChords", () => {
    it("joins every pair of entrances across a convex square", () => {
        const chords = areaChords(square, [1, 3, 5, 7])
        assert.deepStrictEqual(chords, [
            [1, 3],
            [1, 5],
            [1, 7],
            [3, 5],
            [3, 7],
            [5, 7],
        ])
    })

    it("skips entrances that are neighbours on the outline", () => {
        assert.deepStrictEqual(areaChords(square, [0, 1]), [])
        assert.deepStrictEqual(areaChords(square, [0, 7]), [])
    })

    it("leaves out a line that would cut across the missing corner of an L-shape", () => {
        // East end of the bottom arm (2) to the north end of the left arm (4): the straight line
        // runs through the cut-away corner.
        assert.deepStrictEqual(areaChords(lShape, [2, 4]), [])
        // From the south-west corner to the inner corner stays inside.
        assert.deepStrictEqual(areaChords(lShape, [0, 3]), [[0, 3]])
    })

    it("needs at least two entrances", () => {
        assert.deepStrictEqual(areaChords(square, [3]), [])
    })
})
