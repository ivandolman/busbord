import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { config } from "../config";
import type { Candidate, RealtimeAdjustment } from "./types";

const { transit_realtime: rt } = GtfsRealtimeBindings;

interface StopUpdate {
  seq: number | null;
  stopId: string | null;
  arrivalDelay: number | null;
  arrivalTime: number | null;
  departureDelay: number | null;
  departureTime: number | null;
  skipped: boolean;
}

interface TripUpdate {
  cancelled: boolean;
  stops: StopUpdate[];
}

const MAX_FEED_BYTES = 64 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Reads a field only if it was actually present in the message. protobufjs answers absent
 * fields with their default (0, "", Long 0), which would otherwise read as "on time at epoch 0".
 */
function present<T extends object, K extends keyof T>(
  message: T | null | undefined,
  key: K,
): NonNullable<T[K]> | null {
  if (!message || !Object.hasOwn(message, key)) return null;
  return message[key] ?? null;
}

/** protobufjs hands 64-bit integers back as numbers or Long objects depending on the build. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber() as number;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class RealtimeSnapshot {
  constructor(private readonly trips: Map<string, TripUpdate>) {}

  get size(): number {
    return this.trips.size;
  }

  private update(tripId: string, serviceDate: string): TripUpdate | undefined {
    return this.trips.get(`${tripId}|${serviceDate}`) ?? this.trips.get(`${tripId}|`);
  }

  /** Departure delay and cancellation at a single stop, or null when the trip has no update. */
  departureAt(
    tripId: string,
    serviceDate: string,
    seq: number,
    stopId: string,
    planned: number,
  ): { delay: number; cancelled: boolean } | null {
    const update = this.update(tripId, serviceDate);
    if (!update) return null;
    if (update.cancelled) return { delay: 0, cancelled: true };
    const stop = resolveStop(update, seq, stopId, "departure", planned);
    return { delay: stop.delay, cancelled: stop.skipped };
  }

  /** Delay and cancellation for one origin/destination pair, or null when the trip has no update. */
  adjustmentFor(candidate: Candidate): RealtimeAdjustment | null {
    const update = this.update(candidate.tripId, candidate.serviceDate);
    if (!update) return null;
    if (update.cancelled) return { cancelled: true, departureDelay: 0, arrivalDelay: 0 };

    const origin = resolveStop(update, candidate.fromSeq, candidate.fromStopId, "departure", candidate.plannedDeparture);
    const destination = resolveStop(update, candidate.toSeq, candidate.toStopId, "arrival", candidate.plannedArrival);
    return {
      cancelled: origin.skipped || destination.skipped,
      departureDelay: origin.delay,
      arrivalDelay: destination.delay,
    };
  }
}

/**
 * GTFS-realtime only lists stops whose prediction changed; a delay applies to all later stops
 * until another update replaces it. So we walk the updates up to the stop we care about.
 */
function resolveStop(
  update: TripUpdate,
  seq: number,
  stopId: string,
  kind: "departure" | "arrival",
  planned: number,
): { delay: number; skipped: boolean } {
  let carried = 0;
  for (const stop of update.stops) {
    const isTarget = stop.seq !== null ? stop.seq === seq : stop.stopId === stopId;
    if (isTarget) {
      if (stop.skipped) return { delay: 0, skipped: true };
      const time = kind === "departure" ? stop.departureTime : stop.arrivalTime;
      if (time !== null) return { delay: time - planned, skipped: false };
      const delay =
        kind === "departure" ? (stop.departureDelay ?? stop.arrivalDelay) : (stop.arrivalDelay ?? carried);
      return { delay: delay ?? carried, skipped: false };
    }
    if (stop.seq !== null && stop.seq < seq && !stop.skipped) {
      carried = stop.departureDelay ?? stop.arrivalDelay ?? carried;
    }
  }
  return { delay: carried, skipped: false };
}

export function decodeTripUpdates(bytes: Uint8Array): RealtimeSnapshot {
  const feed = rt.FeedMessage.decode(bytes);
  const trips = new Map<string, TripUpdate>();
  const { CANCELED } = rt.TripDescriptor.ScheduleRelationship;
  const { SKIPPED } = rt.TripUpdate.StopTimeUpdate.ScheduleRelationship;

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    const tripId = tripUpdate?.trip?.tripId;
    if (!tripUpdate || !tripId) continue;

    const stops: StopUpdate[] = (tripUpdate.stopTimeUpdate ?? []).map((stop) => ({
      seq: present(stop, "stopSequence"),
      stopId: present(stop, "stopId") || null,
      arrivalDelay: present(stop.arrival, "delay"),
      arrivalTime: toNumber(present(stop.arrival, "time")) || null,
      departureDelay: present(stop.departure, "delay"),
      departureTime: toNumber(present(stop.departure, "time")) || null,
      skipped: present(stop, "scheduleRelationship") === SKIPPED,
    }));
    stops.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

    // Keyed with the start date when the feed gives one, so yesterday's late run of a trip
    // cannot be mistaken for today's.
    trips.set(`${tripId}|${present(tripUpdate.trip, "startDate") ?? ""}`, {
      cancelled: present(tripUpdate.trip, "scheduleRelationship") === CANCELED,
      stops,
    });
  }
  return new RealtimeSnapshot(trips);
}

export interface RealtimeSource {
  snapshot(): Promise<RealtimeSnapshot | null>;
}

/**
 * Fetches the trip-updates feed at most once per TTL and shares the result between requests.
 * Data lives in memory only and is replaced on every refresh, which keeps us well inside the
 * provider's "do not store longer than 30 minutes" condition. A failed fetch is cached for the
 * same TTL so an outage at the provider does not turn every page view into an outbound request.
 */
export class GtfsRealtimeFeed implements RealtimeSource {
  private cached: { snapshot: RealtimeSnapshot | null; fetchedAt: number } | null = null;
  private inFlight: Promise<RealtimeSnapshot | null> | null = null;

  constructor(
    private readonly url: string,
    private readonly userAgent: string,
    private readonly ttlMs: number,
  ) {}

  async snapshot(): Promise<RealtimeSnapshot | null> {
    if (this.cached && Date.now() - this.cached.fetchedAt < this.ttlMs) return this.cached.snapshot;
    this.inFlight ??= this.refresh().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async refresh(): Promise<RealtimeSnapshot | null> {
    let snapshot: RealtimeSnapshot | null = null;
    try {
      const response = await fetch(this.url, {
        headers: { "User-Agent": this.userAgent },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_FEED_BYTES) throw new Error("realtime feed is larger than expected");
      snapshot = decodeTripUpdates(bytes);
    } catch (error) {
      console.warn("Realtime feed unavailable:", error instanceof Error ? error.message : error);
    }
    this.cached = { snapshot, fetchedAt: Date.now() };
    return snapshot;
  }
}

let sharedFeed: GtfsRealtimeFeed | null = null;

export function getRealtimeSource(): RealtimeSource | null {
  if (!config.realtimeEnabled) return null;
  sharedFeed ??= new GtfsRealtimeFeed(config.realtimeUrl, config.userAgent, config.realtimeTtlMs);
  return sharedFeed;
}
