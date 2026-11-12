import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { config } from "../config";

const { transit_realtime: rt } = GtfsRealtimeBindings;

const MAX_FEED_BYTES = 32 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

/** A service alert (diversion, skipped stop, works) as the board shows it. */
export interface ServiceAlert {
  id: string;
  header: string;
  description: string;
}

interface StoredAlert extends ServiceAlert {
  periods: { start: number; end: number }[];
  /** Each informed entity: a route, a stop, or a route at a stop. */
  entities: { routeId: string | null; stopId: string | null }[];
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber() as number;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Dutch text when there is one, else the first translation. */
function text(translated: GtfsRealtimeBindings.transit_realtime.ITranslatedString | null | undefined): string {
  const translations = translated?.translation ?? [];
  const chosen = translations.find((t) => t.language === "nl") ?? translations[0];
  return (chosen?.text ?? "").trim();
}

export function decodeAlerts(bytes: Uint8Array): StoredAlert[] {
  const feed = rt.FeedMessage.decode(bytes);
  const alerts: StoredAlert[] = [];
  for (const entity of feed.entity) {
    const alert = entity.alert;
    if (!alert || entity.isDeleted) continue;
    const header = text(alert.headerText);
    if (!header) continue;
    alerts.push({
      id: entity.id,
      header,
      // The feed repeats the header inside the description; keep only what it adds.
      description: text(alert.descriptionText),
      periods: (alert.activePeriod ?? []).map((period) => ({
        start: toNumber(period.start) || 0,
        end: toNumber(period.end) || Infinity,
      })),
      entities: (alert.informedEntity ?? []).map((informed) => ({
        routeId: informed.routeId || null,
        stopId: informed.stopId || null,
      })),
    });
  }
  return alerts;
}

/**
 * The alerts that touch a trip: active now, and about one of its lines (anywhere, or at one of
 * its stops) or about one of its stops (any line). An alert about a line at a stop you pass but
 * do not use is left out. Same text twice (one per operator) shows once.
 */
export function matchAlerts(
  alerts: StoredAlert[],
  routeIds: ReadonlySet<string>,
  stopIds: ReadonlySet<string>,
  nowSeconds: number,
): ServiceAlert[] {
  const seen = new Set<string>();
  const result: ServiceAlert[] = [];
  for (const alert of alerts) {
    const active = alert.periods.length === 0 || alert.periods.some((p) => p.start <= nowSeconds && nowSeconds <= p.end);
    if (!active) continue;
    const relevant = alert.entities.some(({ routeId, stopId }) =>
      routeId ? routeIds.has(routeId) && (!stopId || stopIds.has(stopId)) : stopId !== null && stopIds.has(stopId),
    );
    if (!relevant || seen.has(alert.header)) continue;
    seen.add(alert.header);
    result.push({ id: alert.id, header: alert.header, description: alert.description });
  }
  return result;
}

export interface AlertSource {
  alerts(): Promise<StoredAlert[] | null>;
}

/** Fetches the alerts feed at most once per TTL, shared between requests, kept in memory only. */
class GtfsAlertsFeed implements AlertSource {
  private cached: { alerts: StoredAlert[] | null; fetchedAt: number } | null = null;
  private inFlight: Promise<StoredAlert[] | null> | null = null;

  constructor(
    private readonly url: string,
    private readonly ttlMs: number,
  ) {}

  async alerts(): Promise<StoredAlert[] | null> {
    if (this.cached && Date.now() - this.cached.fetchedAt < this.ttlMs) return this.cached.alerts;
    this.inFlight ??= this.refresh().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async refresh(): Promise<StoredAlert[] | null> {
    let alerts: StoredAlert[] | null = null;
    try {
      const response = await fetch(this.url, {
        headers: { "User-Agent": config.userAgent },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_FEED_BYTES) throw new Error("alerts feed is larger than expected");
      alerts = decodeAlerts(bytes);
    } catch (error) {
      console.warn("Alerts feed unavailable:", error instanceof Error ? error.message : error);
    }
    this.cached = { alerts, fetchedAt: Date.now() };
    return alerts;
  }
}

let shared: GtfsAlertsFeed | null = null;

export function getAlertSource(): AlertSource | null {
  if (!config.realtimeEnabled) return null;
  shared ??= new GtfsAlertsFeed(config.alertsUrl, config.alertsTtlMs);
  return shared;
}
