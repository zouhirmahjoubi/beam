/**
 * Pure beam logic for the Palmlight puzzle board. No IWSDK or Three imports, so
 * it runs in tests and in the solver unchanged.
 *
 * Board coordinates: `col` grows to the right (+x), `row` grows toward the
 * player (+z). Directions are 45 degree steps counterclockwise seen from
 * above: 0 = +x, 2 = away from the player (-z), 4 = -x, 6 = toward the player.
 */

export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 0 = white (accepted by any crystal), 1 = cyan, 2 = amber. */
export type Color = 0 | 1 | 2;

export type PieceKind = 'mirror' | 'splitter' | 'filter';

export interface Cell {
  col: number;
  row: number;
}

export interface Emitter extends Cell {
  dir: Dir;
}

/** A board crystal. Color 0 is lit by any beam, other colors need a match. */
export interface Crystal extends Cell {
  color: Color;
}

/**
 * A crystal floating above the board. Only a beam lifted off the board by a
 * palm can reach it. `aperture` is the way its opening faces: light must
 * arrive travelling the opposite way.
 */
export interface SkyCrystal {
  col: number;
  row: number;
  /** Meters above the board top. */
  height: number;
  color: Color;
  aperture: 'down' | Dir;
}

export interface TrayPiece {
  kind: PieceKind;
  color?: Color;
}

export interface Level {
  id: string;
  name: string;
  size: number;
  emitter: Emitter;
  crystals: Crystal[];
  blockers: Cell[];
  tray: TrayPiece[];
  sky?: SkyCrystal[];
  /** True when the level needs a palm on the board. */
  palm?: boolean;
  /** Palms the intended answer uses (the solver's budget). Defaults to 2 for palm levels. */
  hands?: 1 | 2;
  /** One short caption naming the idea of the level. */
  hint?: string;
}

/** A piece on the board. `angle` is its mirror line in 45 degree steps. */
export interface Piece extends Cell {
  kind: PieceKind;
  angle: number;
  color?: Color;
}

/**
 * A palm resting in the beam. `nx`/`nz` is the palm normal flattened onto the
 * board. `lift` means the palm is tilted up and sends the beam off the board.
 */
export interface PalmCell extends Cell {
  nx: number;
  nz: number;
  lift: boolean;
  /** Palm faces down or away: the hand only blocks light. */
  block?: boolean;
}

export type BeamEnd =
  | 'edge'
  | 'blocker'
  | 'crystal'
  | 'emitter'
  | 'hand'
  | 'filter'
  | 'lift'
  | 'loop'
  | 'limit';

export interface Lift {
  col: number;
  row: number;
  /** Direction the beam was travelling when it met the palm. */
  dir: Dir;
  palm: number;
  color: Color;
}

export interface BeamPath {
  /** Corner points in continuous cell units. */
  points: Cell[];
  color: Color;
  end: BeamEnd;
  lift?: Lift;
}

export interface TraceResult {
  beams: BeamPath[];
  /** Indexes into `level.crystals` that a beam of the right color reaches. */
  lit: number[];
  /** Which palms the beam touched, by index. */
  palmHits: boolean[];
  /** All board crystals lit. Sky crystals are checked by the caller. */
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

export const MAX_SEGMENTS = 48;
export const MAX_BEAMS = 12;

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

/** Mirror line angle, in 45 degree steps, for a surface with this board normal. */
export function lineFromNormal(nx: number, nz: number): number {
  const normalAngle = Math.atan2(-nz, nx);
  const steps = Math.round((normalAngle + Math.PI / 2) / (Math.PI / 4));
  return ((steps % 8) + 8) % 8;
}

/** Cells that already hold a fixed piece and cannot take a movable one. */
export function fixedCells(level: Level): Set<string> {
  const cells = new Set<string>([key(level.emitter.col, level.emitter.row)]);
  for (const c of level.crystals) cells.add(key(c.col, c.row));
  for (const b of level.blockers) cells.add(key(b.col, b.row));
  return cells;
}

export function canPlace(
  level: Level,
  pieces: ReadonlyArray<Cell | null>,
  cell: Cell,
  ignoreIndex = -1,
): boolean {
  if (!inBounds(level.size, cell.col, cell.row)) return false;
  if (fixedCells(level).has(key(cell.col, cell.row))) return false;
  return !pieces.some(
    (m, i) => i !== ignoreIndex && m != null && m.col === cell.col && m.row === cell.row,
  );
}

interface Head {
  col: number;
  row: number;
  dir: Dir;
  color: Color;
}

export function trace(
  level: Level,
  pieces: ReadonlyArray<Piece | null>,
  palms: ReadonlyArray<PalmCell | null> = [],
): TraceResult {
  const pieceAt = new Map<string, Piece>();
  for (const p of pieces) if (p) pieceAt.set(key(p.col, p.row), p);
  const palmAt = new Map<string, number>();
  palms.forEach((p, i) => {
    if (p && !pieceAt.has(key(p.col, p.row))) palmAt.set(key(p.col, p.row), i);
  });
  const blockers = new Set(level.blockers.map((b) => key(b.col, b.row)));
  const crystalAt = new Map(level.crystals.map((c, i) => [key(c.col, c.row), i]));

  const beams: BeamPath[] = [];
  const lit = new Set<number>();
  const palmHits = palms.map(() => false);
  const visited = new Set<string>();
  const queue: Head[] = [{ ...level.emitter, color: 0 }];
  let segments = 0;

  while (queue.length > 0 && beams.length < MAX_BEAMS) {
    const head = queue.shift()!;
    let { col, row, dir, color } = head;
    const points: Cell[] = [{ col, row }];
    const beam: BeamPath = { points, color, end: 'limit' };
    beams.push(beam);

    for (;;) {
      const [dx, dz] = DIRS[dir];
      const nextCol = col + dx;
      const nextRow = row + dz;
      if (!inBounds(level.size, nextCol, nextRow)) {
        // Run the beam out to the board rim instead of the last cell center.
        points.push({ col: col + dx * 0.5, row: row + dz * 0.5 });
        beam.end = 'edge';
        break;
      }
      col = nextCol;
      row = nextRow;
      const k = key(col, row);

      if (blockers.has(k)) {
        points.push({ col: col - dx * 0.5, row: row - dz * 0.5 });
        beam.end = 'blocker';
        break;
      }
      const crystal = crystalAt.get(k);
      if (crystal !== undefined) {
        points.push({ col, row });
        const want = level.crystals[crystal].color;
        if (want === 0 || want === color) lit.add(crystal);
        beam.end = 'crystal';
        break;
      }
      if (col === level.emitter.col && row === level.emitter.row) {
        points.push({ col, row });
        beam.end = 'emitter';
        break;
      }

      const palmIndex = palmAt.get(k);
      if (palmIndex !== undefined) {
        const palm = palms[palmIndex]!;
        palmHits[palmIndex] = true;
        points.push({ col, row });
        if (palm.block || dx * palm.nx + dz * palm.nz >= 0) {
          beam.end = 'hand';
          break;
        }
        if (palm.lift) {
          beam.end = 'lift';
          beam.lift = { col, row, dir, palm: palmIndex, color };
          break;
        }
        const out = reflect(dir, lineFromNormal(palm.nx, palm.nz));
        if (out === null) {
          points.pop();
        } else {
          dir = out;
          segments++;
        }
      }

      const piece = pieceAt.get(k);
      if (piece) {
        if (piece.kind === 'filter') {
          if (piece.color !== undefined && piece.color !== color) {
            points.push({ col, row });
            // A new color starts a new drawn beam from the filter.
            beam.end = 'filter';
            queue.unshift({ col, row, dir, color: piece.color });
            break;
          }
        } else {
          const out = reflect(dir, piece.angle);
          if (out !== null) {
            if (piece.kind === 'splitter') {
              queue.push({ col, row, dir: out, color });
            } else {
              points.push({ col, row });
              dir = out;
              segments++;
            }
          }
        }
      }

      const state = `${k},${dir},${color}`;
      if (visited.has(state) || segments > MAX_SEGMENTS) {
        points.push({ col, row });
        beam.end = segments > MAX_SEGMENTS ? 'limit' : 'loop';
        break;
      }
      visited.add(state);
    }
  }

  return {
    beams,
    lit: [...lit],
    palmHits,
    solved: lit.size === level.crystals.length,
  };
}
