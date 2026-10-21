/**
 * Share codes: a puzzle made in the maker travels in a link as a short code,
 * so a friend opens it with no server. A code is untrusted input, so decoding
 * checks every field and returns null for anything malformed. Whether the
 * puzzle can be solved is the solver's job (see solve in solver.ts).
 *
 * Version 1 layout, one byte each unless noted:
 *   version, board size, emitter cell, emitter dir | hands << 3,
 *   crystal count, then cell and color per crystal,
 *   blocker count, then cell per blocker,
 *   tray count, then kind | color << 2 per piece.
 * A cell byte is col * 16 + row. Sky crystals are not in version 1.
 */
import { fixedCells, inBounds, type Color, type Crystal, type Dir, type Level, type TrayPiece, type Cell } from './grid.ts';

const VERSION = 1;
const SIZE = 6;
/** Longest code decodeLevel reads; a full version 1 puzzle is well under it. */
const MAX_CODE_LENGTH = 96;
export const MAX_CRYSTALS = 6;
export const MAX_BLOCKERS = 12;
export const MAX_TRAY = 6;
const KINDS = ['mirror', 'splitter', 'filter'] as const;

const cellByte = (cell: Cell) => cell.col * 16 + cell.row;

function toBase64Url(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): number[] | null {
  if (!/^[A-Za-z0-9_-]+$/.test(code) || code.length % 4 === 1) return null;
  try {
    const raw = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    return Array.from(raw, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The share code for a board puzzle. Throws for a level with sky crystals. */
export function encodeLevel(level: Level): string {
  if (level.sky?.length) throw new Error('Sky crystals cannot be shared yet');
  const hands = level.palm ? (level.hands ?? 2) : 0;
  return toBase64Url([
    VERSION,
    level.size,
    cellByte(level.emitter),
    level.emitter.dir | (hands << 3),
    level.crystals.length,
    ...level.crystals.flatMap((c) => [cellByte(c), c.color]),
    level.blockers.length,
    ...level.blockers.map(cellByte),
    level.tray.length,
    ...level.tray.map((t) => KINDS.indexOf(t.kind) | ((t.color ?? 0) << 2)),
  ]);
}

/** The puzzle in a share code, or null when the code is not a valid puzzle. */
export function decodeLevel(code: string): Level | null {
  if (code.length > MAX_CODE_LENGTH) return null;
  const bytes = fromBase64Url(code);
  if (!bytes) return null;
  let at = 0;
  const next = (): number => (at < bytes.length ? bytes[at++] : -1);
  const cell = (): Cell | null => {
    const b = next();
    if (b < 0) return null;
    const col = b >> 4;
    const row = b & 15;
    return inBounds(SIZE, col, row) ? { col, row } : null;
  };
  const count = (min: number, max: number): number | null => {
    const n = next();
    return n >= min && n <= max ? n : null;
  };

  if (next() !== VERSION || next() !== SIZE) return null;
  const emitterCell = cell();
  const dirByte = next();
  if (!emitterCell || dirByte < 0) return null;
  const hands = dirByte >> 3;
  if (hands > 2) return null;

  const crystalCount = count(1, MAX_CRYSTALS);
  if (crystalCount === null) return null;
  const crystals: Crystal[] = [];
  for (let i = 0; i < crystalCount; i++) {
    const c = cell();
    const color = next();
    if (!c || color < 0 || color > 2) return null;
    crystals.push({ ...c, color: color as Color });
  }

  const blockerCount = count(0, MAX_BLOCKERS);
  if (blockerCount === null) return null;
  const blockers: Cell[] = [];
  for (let i = 0; i < blockerCount; i++) {
    const c = cell();
    if (!c) return null;
    blockers.push(c);
  }

  // Something to play with: tray pieces, a palm, or both.
  const trayCount = count(hands > 0 ? 0 : 1, MAX_TRAY);
  if (trayCount === null) return null;
  const tray: TrayPiece[] = [];
  for (let i = 0; i < trayCount; i++) {
    const b = next();
    const kind = KINDS[b & 3];
    const color = b >> 2;
    if (b < 0 || !kind || color > 2) return null;
    // A filter turns the beam one color; mirrors and splitters have none.
    if ((kind === 'filter') !== color > 0) return null;
    tray.push(kind === 'filter' ? { kind, color: color as Color } : { kind });
  }
  if (at !== bytes.length) return null;

  const level: Level = {
    id: `shared-${code}`,
    name: 'Shared puzzle',
    size: SIZE,
    emitter: { ...emitterCell, dir: (dirByte & 7) as Dir },
    crystals,
    blockers,
    tray,
  };
  if (hands > 0) {
    level.palm = true;
    level.hands = hands as 1 | 2;
  }
  // The emitter, crystals and blockers each need a cell of their own.
  if (fixedCells(level).size !== 1 + crystals.length + blockers.length) return null;
  return level;
}
