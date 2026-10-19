import { createComponent, Types } from '@iwsdk/core';

/** A movable piece. `index` is its slot in the level's tray. */
export const BoardPiece = createComponent('BoardPiece', {
  index: { type: Types.Int8, default: 0 },
});
