import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { downloadFeed, parseRetryAfter, readFeedState, retryDelayMs, writeFeedState } from "@/lib/gtfs/download";

const URL = "https://example.org/gtfs.zip";
const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "gtfs-download-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A fetch that answers with the given responses in turn and records the request headers. */
function fakeFetch(...responses: Array<() => Response>) {
  const calls: Record<string, string>[] = [];
  const fn = (async (_url: string, init?: RequestInit) => {
    calls.push({ ...(init?.headers as Record<string, string>) });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  }) as typeof fetch;
  return { fn, calls };
}

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
    expect(parseRetryAfter("Thu, 12 Nov 2026 18:00:00 GMT", Date.parse("2026-11-12T17:59:00Z"))).toBe(60_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("retryDelayMs", () => {
  it("backs off 1, 4, 16, 60 min and caps the server's hint at an hour", () => {
    expect([1, 2, 3, 4].map((attempt) => retryDelayMs(attempt, null) / 60_000)).toEqual([1, 4, 16, 60]);
    expect(retryDelayMs(1, 30_000)).toBe(30_000);
    expect(retryDelayMs(1, 5 * 3_600_000)).toBe(3_600_000);
  });
});

describe("downloadFeed", () => {
  const options = { userAgent: "test", log: () => {}, sleep: async () => {} };

  it("sends the ETag and skips the download when the feed is unchanged", async () => {
    const { fn, calls } = fakeFetch(() => new Response(null, { status: 304 }));
    const result = await downloadFeed(URL, join(tempDir(), "feed.zip"), { ...options, etag: '"abc"', fetch: fn });
    expect(result).toEqual({ status: "unchanged" });
    expect(calls[0]?.["If-None-Match"]).toBe('"abc"');
  });

  it("waits after a 429 and then downloads, returning the new ETag", async () => {
    const waits: number[] = [];
    const target = join(tempDir(), "feed.zip");
    const { fn } = fakeFetch(
      () => new Response("slow down", { status: 429, headers: { "Retry-After": "90" } }),
      () => new Response("zipdata", { status: 200, headers: { ETag: '"new"' } }),
    );
    const result = await downloadFeed(URL, target, { ...options, fetch: fn, sleep: async (ms) => void waits.push(ms) });
    expect(result).toEqual({ status: "downloaded", etag: '"new"' });
    expect(waits).toEqual([90_000]);
    expect(readFileSync(target, "utf8")).toBe("zipdata");
  });

  it("gives up after five attempts, and at once on errors that will not pass", async () => {
    const tooMany = fakeFetch(...Array.from({ length: 5 }, () => () => new Response(null, { status: 429 })));
    await expect(downloadFeed(URL, join(tempDir(), "a.zip"), { ...options, fetch: tooMany.fn })).rejects.toThrow("HTTP 429");
    expect(tooMany.calls).toHaveLength(5);

    const notFound = fakeFetch(() => new Response(null, { status: 404 }));
    await expect(downloadFeed(URL, join(tempDir(), "b.zip"), { ...options, fetch: notFound.fn })).rejects.toThrow("HTTP 404");
    expect(notFound.calls).toHaveLength(1);
  });
});

describe("feed state", () => {
  it("round-trips and ignores a damaged file", () => {
    const path = join(tempDir(), "gtfs.sqlite.feed.json");
    expect(readFeedState(path)).toBeNull();
    writeFeedState(path, { etag: '"abc"', inputs: "{}" });
    expect(readFeedState(path)).toEqual({ etag: '"abc"', inputs: "{}" });
    writeFileSync(path, "{not json");
    expect(readFeedState(path)).toBeNull();
  });
});
