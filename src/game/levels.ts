import type { Level } from './grid.ts';

/*
 * Chapter 1. Boards are 6 x 6; row 0 is the far side, row 5 is nearest you.
 * Each comment shows the intended answer. tests/levels.test.ts proves every
 * level can be solved with its tray and palms.
 */

/** Hold up a palm and bounce the beam to the far crystal. Palm at (3,3). */
export const OPEN_HAND: Level = {
  id: 'open-hand',
  hint: 'Hold your open hand in the beam',
  name: 'Open Hand',
  size: 6,
  emitter: { col: 0, row: 3, dir: 0 },
  crystals: [{ col: 3, row: 0, color: 0 }],
  blockers: [{ col: 5, row: 3 }],
  tray: [],
  palm: true,
  hands: 1,
};

/** Two mirrors at (2,4) and (2,1), both turned to 45 degrees. */
export const FIRST_LIGHT: Level = {
  id: 'first-light',
  hint: 'Pinch a mirror, then turn your hand to rotate it',
  name: 'First Light',
  size: 6,
  emitter: { col: 0, row: 4, dir: 0 },
  crystals: [{ col: 4, row: 1, color: 0 }],
  blockers: [
    { col: 4, row: 2 },
    { col: 4, row: 4 },
  ],
  tray: [{ kind: 'mirror' }, { kind: 'mirror' }],
};

/** Mirror at (2,1) sends the beam toward you, your palm at (2,4) turns it right. */
export const HAND_OFF: Level = {
  id: 'hand-off',
  hint: 'A mirror and your palm, together',
  name: 'Hand Off',
  size: 6,
  emitter: { col: 0, row: 1, dir: 0 },
  crystals: [{ col: 5, row: 4, color: 0 }],
  blockers: [
    { col: 3, row: 1 },
    { col: 5, row: 2 },
  ],
  tray: [{ kind: 'mirror' }],
  palm: true,
  hands: 1,
};

/** Splitter at (2,2) turned to 135 degrees lights both crystals. */
export const FORK: Level = {
  id: 'fork',
  hint: 'A splitter sends light both ways',
  name: 'Fork',
  size: 6,
  emitter: { col: 0, row: 2, dir: 0 },
  crystals: [
    { col: 5, row: 2, color: 0 },
    { col: 2, row: 5, color: 0 },
  ],
  blockers: [{ col: 4, row: 4 }],
  tray: [{ kind: 'splitter' }],
};

/** Splitter at (4,4) at 45 degrees, amber filter in column 4 above it. */
export const AMBER: Level = {
  id: 'amber',
  hint: 'Amber crystals need amber light',
  name: 'Amber',
  size: 6,
  emitter: { col: 0, row: 4, dir: 0 },
  crystals: [
    { col: 4, row: 0, color: 2 },
    { col: 5, row: 4, color: 0 },
  ],
  blockers: [{ col: 2, row: 2 }],
  tray: [{ kind: 'splitter' }, { kind: 'filter', color: 2 }],
};

/**
 * The beam runs toward you; tip your palm up and away under the floating
 * crystal at (3,3), like holding a tray, and it rises into the crystal.
 */
export const LIFT: Level = {
  id: 'lift',
  hint: 'Tip your palm up, like holding a tray',
  name: 'Lift',
  size: 6,
  emitter: { col: 3, row: 0, dir: 6 },
  crystals: [],
  blockers: [{ col: 3, row: 5 }],
  tray: [],
  sky: [{ col: 3, row: 3, height: 0.18, color: 0, aperture: 'down' }],
  palm: true,
  hands: 1,
};

/**
 * Periscope: the beam runs toward you. One palm lifts it at (3,4); the other,
 * higher up, turns it away from you, flat into the crystal hanging over (3,1),
 * whose opening faces you.
 */
export const PERISCOPE: Level = {
  id: 'periscope',
  hint: 'Lift with one hand, aim with the other',
  name: 'Periscope',
  size: 6,
  emitter: { col: 3, row: 0, dir: 6 },
  crystals: [],
  blockers: [{ col: 3, row: 5 }],
  tray: [],
  sky: [{ col: 3, row: 1, height: 0.2, color: 0, aperture: 6 }],
  palm: true,
  hands: 2,
};

/**
 * Mirror at (3,5) at 45 degrees sends light up column 3; a splitter at (3,2)
 * at 135 degrees feeds the white crystal; a cyan filter at (3,1) colors the rest.
 */
export const PRISM: Level = {
  id: 'prism',
  hint: 'Mirror, splitter and filter',
  name: 'Prism',
  size: 6,
  emitter: { col: 0, row: 5, dir: 0 },
  crystals: [
    { col: 0, row: 2, color: 0 },
    { col: 3, row: 0, color: 1 },
  ],
  blockers: [{ col: 5, row: 5 }],
  tray: [{ kind: 'mirror' }, { kind: 'splitter' }, { kind: 'filter', color: 1 }],
};

/*
 * Chapter 2.
 */

/** Diagonal light stays diagonal: mirrors at (2,3) and (3,4), both flat, zigzag it to (5,2). */
export const DIAGONAL: Level = {
  id: 'diagonal',
  hint: 'Diagonal light stays diagonal',
  name: 'Diagonal',
  size: 6,
  emitter: { col: 0, row: 5, dir: 1 },
  crystals: [{ col: 5, row: 2, color: 0 }],
  blockers: [{ col: 4, row: 1 }],
  tray: [{ kind: 'mirror' }, { kind: 'mirror' }],
};

/** Both hands as mirrors: palm at (1,4) turns the beam right, palm at (4,4) sends it away. */
export const BOTH_HANDS: Level = {
  id: 'both-hands',
  hint: 'Both hands as mirrors',
  name: 'Both Hands',
  size: 6,
  emitter: { col: 1, row: 0, dir: 6 },
  crystals: [{ col: 4, row: 1, color: 0 }],
  blockers: [{ col: 2, row: 1 }],
  tray: [],
  palm: true,
  hands: 2,
};

/** Splitter at (2,2) at 135 degrees; amber filter below it, cyan filter to its right. */
export const TWO_COLORS: Level = {
  id: 'two-colors',
  hint: 'Two colors from one beam',
  name: 'Two Colors',
  size: 6,
  emitter: { col: 0, row: 2, dir: 0 },
  crystals: [
    { col: 5, row: 2, color: 1 },
    { col: 2, row: 5, color: 2 },
  ],
  blockers: [{ col: 4, row: 4 }],
  tray: [{ kind: 'splitter' }, { kind: 'filter', color: 1 }, { kind: 'filter', color: 2 }],
};

/** Three mirrors: down column 4, back along row 3, then down column 1 to (1,5). */
export const LONG_WAY: Level = {
  id: 'long-way',
  hint: 'Take the long way round',
  name: 'Long Way',
  size: 6,
  emitter: { col: 0, row: 0, dir: 0 },
  crystals: [{ col: 1, row: 5, color: 0 }],
  blockers: [
    { col: 1, row: 2 },
    { col: 2, row: 4 },
    { col: 3, row: 2 },
    { col: 3, row: 5 },
    { col: 5, row: 0 },
  ],
  tray: [{ kind: 'mirror' }, { kind: 'mirror' }, { kind: 'mirror' }],
};

/** Splitter at (2,3) feeds (2,0); the beam that passes it meets your palm at (4,3). */
export const PALM_SPLIT: Level = {
  id: 'palm-split',
  hint: 'Split the light, catch half with your palm',
  name: 'Palm Split',
  size: 6,
  emitter: { col: 0, row: 3, dir: 0 },
  crystals: [
    { col: 2, row: 0, color: 0 },
    { col: 4, row: 0, color: 0 },
  ],
  blockers: [{ col: 5, row: 3 }],
  tray: [{ kind: 'splitter' }],
  palm: true,
  hands: 1,
};

/** Mirror at (3,1) sends the beam toward you; your palm lifts it at (3,4). */
export const HIGH_SHELF: Level = {
  id: 'high-shelf',
  hint: 'Bring the beam to you, then lift it',
  name: 'High Shelf',
  size: 6,
  emitter: { col: 0, row: 1, dir: 0 },
  crystals: [],
  blockers: [{ col: 5, row: 1 }],
  tray: [{ kind: 'mirror' }],
  sky: [{ col: 3, row: 4, height: 0.16, color: 0, aperture: 'down' }],
  palm: true,
  hands: 1,
};

/** Mirror, amber filter, palm, mirror: a relay from the far corner to (5,1). */
export const RELAY: Level = {
  id: 'relay',
  hint: 'Pass the light along',
  name: 'Relay',
  size: 6,
  emitter: { col: 0, row: 0, dir: 6 },
  crystals: [{ col: 5, row: 1, color: 2 }],
  blockers: [
    { col: 0, row: 5 },
    { col: 2, row: 1 },
    { col: 4, row: 3 },
    { col: 5, row: 2 },
  ],
  tray: [{ kind: 'mirror' }, { kind: 'mirror' }, { kind: 'filter', color: 2 }],
  palm: true,
  hands: 1,
};

/** Splitter at (3,1): one half through a cyan filter to (5,1), the other toward you and up off your palm. */
export const FINALE: Level = {
  id: 'finale',
  hint: 'One beam, two crystals, one up high',
  name: 'Finale',
  size: 6,
  emitter: { col: 0, row: 1, dir: 0 },
  crystals: [{ col: 5, row: 1, color: 1 }],
  blockers: [{ col: 3, row: 5 }],
  tray: [{ kind: 'splitter' }, { kind: 'filter', color: 1 }],
  sky: [{ col: 3, row: 4, height: 0.16, color: 0, aperture: 'down' }],
  palm: true,
  hands: 1,
};

export const LEVELS: Level[] = [
  OPEN_HAND,
  FIRST_LIGHT,
  HAND_OFF,
  FORK,
  AMBER,
  LIFT,
  PERISCOPE,
  PRISM,
  DIAGONAL,
  BOTH_HANDS,
  TWO_COLORS,
  LONG_WAY,
  PALM_SPLIT,
  HIGH_SHELF,
  RELAY,
  FINALE,
];
