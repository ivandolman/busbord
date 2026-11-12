const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

/** Degrees of latitude/longitude that span `meters` around a latitude, for cheap box prefilters. */
export function boxAround(lat: number, meters: number): { dLat: number; dLon: number } {
  const dLat = meters / 111_320;
  const dLon = meters / (111_320 * Math.cos(toRadians(lat)));
  return { dLat, dLon };
}

/** Lower-cased, accent-free, punctuation-free form used to match stop names against user input. */
export function normaliseForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
