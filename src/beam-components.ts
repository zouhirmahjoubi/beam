import { createComponent, Types } from '@iwsdk/core';

/** A movable piece. `index` is its slot in the level's tray. */
export const BoardPiece = createComponent('BoardPiece', {
  index: { type: Types.Int8, default: 0 },
});

/**
 * A board button hit area. `action`: 0 restart, 1 next level, 2 daily, 3 tray side,
 * 4 make, 5 find my desk, then the maker bar: 6 clear, 7 move light, 8 share, 9 done.
 */
export const BoardButton = createComponent('BoardButton', {
  action: { type: Types.Int8, default: 0 },
});

/** A board cell the puzzle maker changes on a pinch. `cell` is col * 6 + row. */
export const BoardCell = createComponent('BoardCell', {
  cell: { type: Types.Int8, default: 0 },
});
