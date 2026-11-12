/**
 * A board endpoint is either a stop area id or a point picked on the map, written "@lat,lon".
 * Points keep five decimals (about a metre), which is plenty and keeps URLs short.
 */
export interface Point {
  lat: number;
  lon: number;
}

const POINT_PATTERN = /^@(-?\d{1,2}(?:\.\d{1,7})?),(-?\d{1,3}(?:\.\d{1,7})?)$/;

export function parsePointId(id: string): Point | null {
  const match = POINT_PATTERN.exec(id);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function pointId(point: Point): string {
  return `@${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
}

const AREA_ID_PATTERN = /^[\w:.\-|]{1,80}$/;

export function isAreaId(value: string | null): value is string {
  return value !== null && AREA_ID_PATTERN.test(value);
}

/** A stop area id or a map point ("@lat,lon"). Safe to use in the browser. */
export function isPlaceId(value: string | null): value is string {
  return value !== null && (AREA_ID_PATTERN.test(value) || parsePointId(value) !== null);
}
