/**
 * Puzzle maker rules: the player lays out the light, crystals and blockers,
 * then lights every crystal with their own pieces. Those pieces become the
 * tray of the shared puzzle, so a puzzle can only be shared once its maker
 * has solved it.
 */
import { inBounds, trace, type Cell, type Color, type Crystal, type Dir, type Emitter, type Level, type Piece, type TrayPiece } from './grid.ts';
import { decodeLevel, encodeLevel, MAX_BLOCKERS, MAX_CRYSTALS, MAX_TRAY } from './share.ts';
import { solve } from './solver.ts';

const SIZE = 6;

/** The fixed part of a puzzle being made. */
export interface Draft {
  emitter: Emitter;
  crystals: Crystal[];
  blockers: Cell[];
}

export type ShareCheck = { ok: true; level: Level; code: string } | { ok: false; reason: string };

/** What a tap on a cell turns it into, in order. A number is a crystal color. */
type Content = 'empty' | 'blocker' | Color;
const CYCLE: readonly Content[] = ['empty', 'blocker', 0, 1, 2];

const at = (c: Cell, col: number, row: number) => c.col === col && c.row === row;

export function emptyDraft(): Draft {
  return { emitter: { col: 0, row: 2, dir: 0 }, crystals: [], blockers: [] };
}

function contentAt(d: Draft, col: number, row: number): Content {
  if (d.blockers.some((b) => at(b, col, row))) return 'blocker';
  return d.crystals.find((c) => at(c, col, row))?.color ?? 'empty';
}

function withContent(d: Draft, col: number, row: number, content: Content): Draft {
  const crystals = d.crystals.filter((c) => !at(c, col, row));
  const blockers = d.blockers.filter((b) => !at(b, col, row));
  if (content === 'blocker') blockers.push({ col, row });
  else if (content !== 'empty') crystals.push({ col, row, color: content });
  return { emitter: d.emitter, crystals, blockers };
}

/** A tap on the light turns it 45 degrees; a tap on any other cell changes what is on it. */
export function tapCell(d: Draft, col: number, row: number): Draft {
  if (!inBounds(SIZE, col, row)) return d;
  if (at(d.emitter, col, row)) return { ...d, emitter: { ...d.emitter, dir: ((d.emitter.dir + 1) % 8) as Dir } };
  const now = contentAt(d, col, row);
  const crystalHere = typeof now === 'number';
  let i = CYCLE.indexOf(now);
  for (let step = 1; step < CYCLE.length; step++) {
    const next = CYCLE[(i + step) % CYCLE.length];
    // Past a share limit, skip the step that would add one more.
    if (next === 'blocker' && d.blockers.length >= MAX_BLOCKERS) continue;
    if (typeof next === 'number' && !crystalHere && d.crystals.length >= MAX_CRYSTALS) continue;
    return withContent(d, col, row, next);
  }
  return d;
}

/** Move the light to an empty cell, keeping its direction. */
export function moveLight(d: Draft, col: number, row: number): Draft {
  if (!inBounds(SIZE, col, row) || at(d.emitter, col, row) || contentAt(d, col, row) !== 'empty') return d;
  return { ...d, emitter: { ...d.emitter, col, row } };
}

/** The draft as a playable level with the given tray. */
export function draftLevel(d: Draft, tray: TrayPiece[]): Level {
  return { id: 'maker', name: 'Your puzzle', size: SIZE, emitter: d.emitter, crystals: d.crystals, blockers: d.blockers, tray };
}

/** Whether the draft can be shared with the pieces the maker placed, and its code when it can. */
export function checkShare(d: Draft, placed: ReadonlyArray<Piece | null>): ShareCheck {
  const pieces = placed.filter((p): p is Piece => p !== null);
  if (d.crystals.length === 0) return { ok: false, reason: 'Add a crystal first' };
  if (trace(draftLevel(d, []), []).solved) return { ok: false, reason: 'The light already reaches every crystal' };
  const tray = pieces.map((p): TrayPiece => (p.kind === 'filter' ? { kind: p.kind, color: p.color } : { kind: p.kind }));
  const level = draftLevel(d, tray);
  const solved = pieces.length > 0 && pieces.length <= MAX_TRAY && trace(level, pieces).solved;
  const code = solved && solve(level) ? encodeLevel(level) : null;
  const shared = code ? decodeLevel(code) : null;
  if (!code || !shared) return { ok: false, reason: 'Light every crystal with your pieces' };
  return { ok: true, level: shared, code };
}
