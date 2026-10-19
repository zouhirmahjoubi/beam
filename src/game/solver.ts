/**
 * Brute-force solver for Palmlight levels. Used by tests for every level and,
 * later, to check daily and player-made puzzles before they are shown.
 *
 * Pieces only matter where a beam already passes, so each step tries the free
 * cells on the current beams. A grid palm counts as a two-sided mirror the
 * player can face either way. A lifting palm sends light into the air; a sky
 * crystal is reachable by one palm when it sits inside its opening's cone as
 * seen from the lift point, and by two palms (a periscope) from any lift.
 */
import {
  DIRS,
  canPlace,
  lineFromNormal,
  trace,
  type Cell,
  type Level,
  type PalmCell,
  type Piece,
  type TrayPiece,
} from './grid.ts';
import { APERTURE_HALF_ANGLE, apertureVector, type V3 } from './optics.ts';

/** Matches BEAM_Y and CELL in board-visuals.ts. */
const CELL = 0.06;
const BEAM_Y = 0.024;

export interface Solution {
  pieces: Piece[];
  palms: PalmCell[];
}

type Move = { kind: 'piece'; tray: number } | { kind: 'palm' };

/** Every cell a beam crosses, from its corner points. */
export function pathCells(points: ReadonlyArray<Cell>): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const sx = Math.sign(b.col - a.col);
    const sz = Math.sign(b.row - a.row);
    let col = a.col;
    let row = a.row;
    while (Math.abs(b.col - col) >= 1 || Math.abs(b.row - row) >= 1) {
      col += sx;
      row += sz;
      cells.push({ col, row });
    }
  }
  return cells;
}

/** Board-local meters of a cell center at beam height. */
export function cellPoint(size: number, col: number, row: number, y = BEAM_Y): V3 {
  return [(col - (size - 1) / 2) * CELL, y, (row - (size - 1) / 2) * CELL];
}

function skyReachable(level: Level, lifts: Cell[], palmsLeft: number): boolean {
  const sky = level.sky ?? [];
  return sky.every((s) => {
    const target = cellPoint(level.size, s.col, s.row, s.height);
    return lifts.some((lift) => {
      if (palmsLeft >= 1) return true; // a second palm can turn it into the opening
      const from = cellPoint(level.size, lift.col, lift.row);
      const d: V3 = [target[0] - from[0], target[1] - from[1], target[2] - from[2]];
      if (d[1] <= 0) return false;
      const l = Math.hypot(...d);
      const a = apertureVector(s.aperture);
      const cos = -(d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) / l;
      return cos >= Math.cos(APERTURE_HALF_ANGLE);
    });
  });
}

/** A palm normal that faces a beam arriving in `dir`, for a given mirror line. */
function facingNormal(line: number, dir: number): [number, number] {
  const angle = ((line - 2) * Math.PI) / 4;
  let nx = Math.cos(angle);
  let nz = -Math.sin(angle);
  const [dx, dz] = DIRS[dir];
  if (dx * nx + dz * nz > 0) {
    nx = -nx;
    nz = -nz;
  }
  return [nx, nz];
}

export function solve(level: Level, maxPalms = level.palm || level.sky?.length ? 2 : 0): Solution | null {
  const hasSky = (level.sky?.length ?? 0) > 0;
  const pieces: Piece[] = [];
  const palms: PalmCell[] = [];
  const usedTray = level.tray.map(() => false);

  const search = (): boolean => {
    const result = trace(level, pieces, palms);
    const lifts = result.beams.filter((b) => b.lift).map((b) => b.lift!);
    const palmsLeft = maxPalms - palms.length;
    if (result.solved && (!hasSky || (lifts.length > 0 && skyReachable(level, lifts, palmsLeft)))) {
      return true;
    }

    const moves: Move[] = [];
    const seenKinds = new Set<string>();
    level.tray.forEach((t: TrayPiece, i) => {
      const id = `${t.kind}:${t.color ?? ''}`;
      if (!usedTray[i] && !seenKinds.has(id)) {
        seenKinds.add(id);
        moves.push({ kind: 'piece', tray: i });
      }
    });
    if (palms.length < maxPalms && !lifts.length) moves.push({ kind: 'palm' });
    if (moves.length === 0) return false;

    const taken = [...pieces, ...palms];
    for (const beam of result.beams) {
      let dir = level.emitter.dir as number;
      const pts = beam.points;
      for (const cell of pathCells(pts)) {
        if (!Number.isInteger(cell.col) || !canPlace(level, taken, cell)) continue;
        // Direction the beam travels through this cell.
        for (let i = 0; i + 1 < pts.length; i++) {
          const inside =
            (cell.col - pts[i].col) * (pts[i + 1].col - cell.col) >= 0 &&
            (cell.row - pts[i].row) * (pts[i + 1].row - cell.row) >= 0;
          if (inside) {
            const sx = Math.sign(pts[i + 1].col - pts[i].col);
            const sz = Math.sign(pts[i + 1].row - pts[i].row);
            dir = DIRS.findIndex(([x, z]) => x === sx && z === sz);
            break;
          }
        }
        for (const move of moves) {
          if (move.kind === 'piece') {
            const t = level.tray[move.tray];
            const angles = t.kind === 'filter' ? [0] : [0, 1, 2, 3];
            usedTray[move.tray] = true;
            for (const angle of angles) {
              pieces.push({ kind: t.kind, col: cell.col, row: cell.row, angle, color: t.color });
              if (search()) return true;
              pieces.pop();
            }
            usedTray[move.tray] = false;
          } else {
            for (const line of [0, 1, 2, 3]) {
              const [nx, nz] = facingNormal(line, dir);
              palms.push({ col: cell.col, row: cell.row, nx, nz, lift: false });
              if (search()) return true;
              palms.pop();
            }
            if (hasSky) {
              const [dx, dz] = DIRS[dir];
              palms.push({ col: cell.col, row: cell.row, nx: -dx, nz: -dz, lift: true });
              if (search()) return true;
              palms.pop();
            }
          }
        }
      }
    }
    return false;
  };

  return search() ? { pieces: [...pieces], palms: [...palms] } : null;
}

/** Sanity helper for tests: the line a palm normal produces. */
export const palmLine = (p: PalmCell) => lineFromNormal(p.nx, p.nz) % 4;
