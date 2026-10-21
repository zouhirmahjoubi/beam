/** Small pure helpers for seating the board on detected room surfaces. */

/** Even-odd test: is (x, z) inside the polygon given by its corners? */
export function pointInPolygon(x: number, z: number, polygon: ReadonlyArray<{ x: number; z: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
