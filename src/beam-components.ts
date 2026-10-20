import { createComponent, Types } from '@iwsdk/core';

/** A movable piece. `index` is its slot in the level's tray. */
export const BoardPiece = createComponent('BoardPiece', {
  index: { type: Types.Int8, default: 0 },
});

/** A board button hit area. `action`: 0 restart, 1 next level, 2 tray side. */
export const BoardButton = createComponent('BoardButton', {
  action: { type: Types.Int8, default: 0 },
});
