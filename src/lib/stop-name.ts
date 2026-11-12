/**
 * The part of a stop name that tells stops apart. Operators spell the same stop differently
 * ("Kleinesingel" and "Kleine Singel", accents, punctuation), so names are compared without case,
 * accents, spaces or punctuation.
 */
export function stopNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
