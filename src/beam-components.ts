import { createComponent, Types } from '@iwsdk/core';

/** A movable piece. `index` is its slot in the level's tray. */
export const BoardPiece = createComponent('BoardPiece', {
  index: { type: Types.Int8, default: 0 },
});

/** A board button hit area. `action`: 0 restart, 1 next level, 2 daily, 3 tray side, 4 find my desk. */
export const BoardButton = createComponent('BoardButton', {
  action: { type: Types.Int8, default: 0 },
});
