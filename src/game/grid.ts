/**
 * Pure beam logic for the Beam puzzle board. No IWSDK or Three imports, so it
 * runs in tests and in the solver unchanged.
 *
 * Board coordinates: `col` grows to the right (+x), `row` grows toward the
 * player (+z). Directions are 45 degree steps counterclockwise seen from
 * above: 0 = +x, 2 = away from the player (-z), 4 = -x, 6 = toward the player.
 */

export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Cell {
  col: number;
  row: number;
}

export interface Emitter extends Cell {
  dir: Dir;
}

export interface Level {
  id: string;
  name: string;
  size: number;
  emitter: Emitter;
  crystals: Cell[];
  blockers: Cell[];
  /** Number of mirrors in the tray. */
  mirrors: number;
}

/** A mirror on the board. `angle` is its line angle in 45 degree steps. */
export interface PlacedMirror extends Cell {
  angle: number;
}

export type BeamEnd = 'edge' | 'blocker' | 'crystal' | 'emitter' | 'loop' | 'limit';

export interface TraceResult {
  /** Beam corner points in continuous cell units, starting at the emitter. */
  points: Array<{ col: number; row: number }>;
  /** Indexes into `level.crystals` that the beam reaches. */
  lit: number[];
  end: BeamEnd;
  solved: boolean;
}

export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export const MAX_SEGMENTS = 16;

const key = (col: number, row: number) => `${col},${row}`;

export const inBounds = (size: number, col: number, row: number) =>
  col >= 0 && row >= 0 && col < size && row < size;

/** Reflect a travel direction off a two-sided mirror with the given line angle. */
export function reflect(dir: Dir, angle: number): Dir | null {
  // A beam running along the mirror line passes it edge-on.
  if ((((dir - angle) % 4) + 4) % 4 === 0) {
    return null;
  }
  return ((((2 * angle - dir) % 8) + 8) % 8) as Dir;
}

/** Cells that already hold a fixed piece and cannot take a mirror. */
export function fixedCells(level: Level): Set<string> {
  const cells = new Set<string>([key(level.emitter.col, level.emitter.row)]);
  for (const c of level.crystals) cells.add(key(c.col, c.row));
  for (const b of level.blockers) cells.add(key(b.col, b.row));
  return cells;
}

export function canPlace(
  level: Level,
  mirrors: ReadonlyArray<PlacedMirror | null>,
  cell: Cell,
  ignoreIndex = -1,
): boolean {
  if (!inBounds(level.size, cell.col, cell.row)) return false;
  if (fixedCells(level).has(key(cell.col, cell.row))) return false;
  return !mirrors.some(
    (m, i) => i !== ignoreIndex && m != null && m.col === cell.col && m.row === cell.row,
  );
}

export function trace(level: Level, mirrors: ReadonlyArray<PlacedMirror | null>): TraceResult {
  const mirrorAt = new Map<string, PlacedMirror>();
  for (const m of mirrors) if (m) mirrorAt.set(key(m.col, m.row), m);
  const blockers = new Set(level.blockers.map((b) => key(b.col, b.row)));
  const crystalAt = new Map(level.crystals.map((c, i) => [key(c.col, c.row), i]));

  let { col, row, dir } = level.emitter;
  const points = [{ col, row }];
  const visited = new Set<string>();
  const lit: number[] = [];
  let end: BeamEnd = 'limit';

  for (let steps = 0; steps < level.size * level.size * 8; steps++) {
    const [dx, dz] = DIRS[dir];
    const nextCol = col + dx;
    const nextRow = row + dz;

    if (!inBounds(level.size, nextCol, nextRow)) {
      // Run the beam out to the board rim instead of the last cell center.
      points.push({ col: col + dx * 0.5, row: row + dz * 0.5 });
      end = 'edge';
      break;
    }
    col = nextCol;
    row = nextRow;
    const k = key(col, row);

    if (blockers.has(k)) {
      points.push({ col: col - dx * 0.5, row: row - dz * 0.5 });
      end = 'blocker';
      break;
    }
    const crystal = crystalAt.get(k);
    if (crystal !== undefined) {
      points.push({ col, row });
      lit.push(crystal);
      end = 'crystal';
      break;
    }
    if (col === level.emitter.col && row === level.emitter.row) {
      points.push({ col, row });
      end = 'emitter';
      break;
    }
    const mirror = mirrorAt.get(k);
    if (mirror) {
      const out = reflect(dir, mirror.angle);
      if (out !== null) {
        points.push({ col, row });
        dir = out;
        if (points.length > MAX_SEGMENTS) {
          end = 'limit';
          break;
        }
      }
    }
    const state = `${k},${dir}`;
    if (visited.has(state)) {
      points.push({ col, row });
      end = 'loop';
      break;
    }
    visited.add(state);
  }

  return { points, lit, end, solved: lit.length === level.crystals.length };
}
