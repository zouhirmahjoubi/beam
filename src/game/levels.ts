import type { Level } from './grid.js';

/**
 * Board layout on a 6 x 6 grid (row 0 is the far side):
 *
 *   . . . . . .
 *   . . . . C .      C crystal, E emitter firing right, # blocker
 *   . . . . # .
 *   . . . . . .
 *   E . . . # .
 *   . . . . . .
 *
 * Solution: a mirror at (2,4) turned to 45 degrees sends the beam up column 2,
 * a second one at (2,1) turned the same way sends it right into the crystal.
 */
export const FIRST_LIGHT: Level = {
  id: 'first-light',
  name: 'First Light',
  size: 6,
  emitter: { col: 0, row: 4, dir: 0 },
  crystals: [{ col: 4, row: 1 }],
  blockers: [
    { col: 4, row: 2 },
    { col: 4, row: 4 },
  ],
  mirrors: 2,
};

export const LEVELS: Level[] = [FIRST_LIGHT];
