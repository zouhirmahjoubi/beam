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

function skyReachable(
  level: Level,
  lifts: Array<Cell & { dir: number }>,
  palmsLeft: number,
  poseOk: PoseCheck,
): boolean {
  const sky = level.sky ?? [];
  const cone = Math.cos(APERTURE_HALF_ANGLE);
  return sky.every((s) => {
    const target = cellPoint(level.size, s.col, s.row, s.height);
    const opening = apertureVector(s.aperture);
    const into = (from: V3) => {
      const d = unit([target[0] - from[0], target[1] - from[1], target[2] - from[2]]);
      return { d, ok: -(d[0] * opening[0] + d[1] * opening[1] + d[2] * opening[2]) >= cone };
    };
    return lifts.some((lift) => {
      const from = cellPoint(level.size, lift.col, lift.row);
      const [dx, dz] = DIRS[lift.dir];
      const beam = unit([dx, 0, dz]);
      // One palm: tip it so the beam goes straight into the opening.
      const direct = into(from);
      if (direct.ok && direct.d[1] > 0) {
        const n = unit([direct.d[0] - beam[0], direct.d[1] - beam[1], direct.d[2] - beam[2]]);
        if (poseOk(from, n)) return true;
      }
      // Two palms: lift straight up, then turn it flat into the opening.
      if (palmsLeft < 1) return false;
      const liftNormal = unit([-beam[0], 1, -beam[2]]);
      const upper: V3 = [from[0], target[1], from[2]];
      const turn = into(upper);
      if (!turn.ok || !poseOk(from, liftNormal)) return false;
      return poseOk(upper, unit([turn.d[0], turn.d[1] - 1, turn.d[2]]));
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

/** A palm at `at` (board-local meters) facing `normal` is allowed. */
export type PoseCheck = (at: V3, normal: V3) => boolean;

const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * `poseOk` can veto palm poses, for example ones that would make the player
 * face a palm toward the headset. It sees every palm the answer needs: palms
 * on the board, palms lifting the beam and the upper palm of a periscope.
 */
export function solve(
  level: Level,
  maxPalms = level.hands ?? (level.palm || level.sky?.length ? 2 : 0),
  poseOk: PoseCheck = () => true,
): Solution | null {
  const hasSky = (level.sky?.length ?? 0) > 0;
  const pieces: Piece[] = [];
  const palms: PalmCell[] = [];
  const usedTray = level.tray.map(() => false);

  const search = (): boolean => {
    const result = trace(level, pieces, palms);
    const lifts = result.beams.filter((b) => b.lift).map((b) => b.lift!);
    const palmsLeft = maxPalms - palms.length;
    if (result.solved && (!hasSky || (lifts.length > 0 && skyReachable(level, lifts, palmsLeft, poseOk)))) {
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
              const palm: PalmCell = { col: cell.col, row: cell.row, nx, nz, lift: false };
              if (!poseOk(cellPoint(level.size, cell.col, cell.row), unit([nx, 0, nz]))) continue;
              palms.push(palm);
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
