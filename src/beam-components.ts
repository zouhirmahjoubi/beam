import { createComponent, Types } from '@iwsdk/core';

/** A movable mirror. `index` is its slot in the level's mirror tray. */
export const MirrorPiece = createComponent('MirrorPiece', {
  index: { type: Types.Int8, default: 0 },
});
