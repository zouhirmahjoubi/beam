/**
 * Daily puzzle: built from the date, so every player gets the same board on
 * the same day with no server. A candidate is built by walking a beam path
 * and dropping pieces on it, then kept only when the solver proves it can be
 * solved and that every tray piece is needed.
 */
import { DIRS, inBounds, type Cell, type Color, type Dir, type Level, type PieceKind, type TrayPiece } from './grid.ts';
import { solve } from './solver.ts';

const SIZE = 6;
const MAX_ATTEMPTS = 400;

/** FNV-1a hash of a string, as an unsigned 32-bit seed. */
export function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG returning numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Piece mix by weekday: easier early in the week, new pieces later. */
function planFor(weekday: number, rand: () => number): PieceKind[] {
  switch (weekday) {
    case 1:
    case 2:
      return ['mirror', 'mirror'];
    case 3:
    case 4:
      return ['mirror', 'mirror', 'mirror'];
    case 5:
      return rand() < 0.5 ? ['splitter', 'mirror'] : ['mirror', 'splitter'];
    default:
      return rand() < 0.5 ? ['filter', 'mirror', 'mirror'] : ['mirror', 'filter', 'mirror'];
  }
}

const key = (c: Cell) => `${c.col},${c.row}`;

function build(rand: () => number, plan: PieceKind[], id: string): Level | null {
  const int = (n: number) => Math.floor(rand() * n);
  const side = int(4);
  const along = 1 + int(SIZE - 2);
  const starts: Array<[number, number, Dir]> = [
    [0, along, 0],
    [SIZE - 1, along, 4],
    [along, 0, 6],
    [along, SIZE - 1, 2],
  ];
  const [col0, row0, dir0] = starts[side];
  const used = new Set<string>([key({ col: col0, row: row0 })]);
  let at: Cell = { col: col0, row: row0 };
  let dir: Dir = dir0;
  let color: Color = 0;
  const crystals: Array<{ col: number; row: number; color: Color }> = [];
  const tray: TrayPiece[] = [];

  /** Walk 1 to 3 free cells straight ahead; null when the path runs out. */
  const walk = (from: Cell, d: Dir): Cell | null => {
    const steps = 1 + int(3);
    let c = from;
    for (let s = 0; s < steps; s++) {
      const next = { col: c.col + DIRS[d][0], row: c.row + DIRS[d][1] };
      if (!inBounds(SIZE, next.col, next.row) || used.has(key(next))) return null;
      used.add(key(next));
      c = next;
    }
    return c;
  };

  for (const kind of plan) {
    const cell = walk(at, dir);
    if (!cell) return null;
    at = cell;
    if (kind === 'filter') {
      color = (1 + int(2)) as Color;
      tray.push({ kind: 'filter', color });
      continue;
    }
    tray.push({ kind });
    const turned = (((dir + (rand() < 0.5 ? 2 : -2)) % 8) + 8) % 8 as Dir;
    if (kind === 'splitter') {
      // The straight-through half of the beam feeds a second crystal.
      const end = walk(at, dir);
      if (!end) return null;
      crystals.push({ ...end, color });
    }
    dir = turned;
  }
  const end = walk(at, dir);
  if (!end) return null;
  crystals.push({ ...end, color });

  // A few blockers off the solution path close easy shortcuts.
  const blockers: Cell[] = [];
  for (let tries = 0; blockers.length < 2 && tries < 30; tries++) {
    const c = { col: int(SIZE), row: int(SIZE) };
    if (!used.has(key(c))) {
      used.add(key(c));
      blockers.push(c);
    }
  }

  return {
    id,
    name: 'Daily puzzle',
    size: SIZE,
    emitter: { col: col0, row: row0, dir: dir0 },
    crystals,
    blockers,
    tray,
  };
}

/** True when the level can be solved, but not with any one tray piece removed. */
export function needsWholeTray(level: Level): boolean {
  if (!solve(level, 0)) return false;
  return level.tray.every((_, i) => solve({ ...level, tray: level.tray.filter((__, j) => j !== i) }, 0) === null);
}

/** The puzzle for a local day key (YYYY-MM-DD). */
export function generateDaily(day: string): Level {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  const rand = mulberry32(hashKey(day));
  const plans: PieceKind[][] = [planFor(weekday, rand), ['mirror', 'mirror']];
  for (const plan of plans) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const level = build(rand, plan, `daily-${day}`);
      if (level && needsWholeTray(level)) return level;
    }
  }
  // Never expected; keeps the button working even if generation fails.
  return {
    id: `daily-${day}`,
    name: 'Daily puzzle (backup)',
    size: SIZE,
    emitter: { col: 0, row: 4, dir: 0 },
    crystals: [{ col: 4, row: 1, color: 0 }],
    blockers: [
      { col: 4, row: 2 },
      { col: 4, row: 4 },
    ],
    tray: [{ kind: 'mirror' }, { kind: 'mirror' }],
  };
}
