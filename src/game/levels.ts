import type { Level } from './grid.ts';

/*
 * Chapter 1. Boards are 6 x 6; row 0 is the far side, row 5 is nearest you.
 * Each comment shows the intended answer. tests/levels.test.ts proves every
 * level can be solved with its tray and palms.
 */

/** Hold up a palm and bounce the beam to the far crystal. Palm at (3,3). */
export const OPEN_HAND: Level = {
  id: 'open-hand',
  name: 'Open Hand',
  size: 6,
  emitter: { col: 0, row: 3, dir: 0 },
  crystals: [{ col: 3, row: 0, color: 0 }],
  blockers: [{ col: 5, row: 3 }],
  tray: [],
  palm: true,
};

/** Two mirrors at (2,4) and (2,1), both turned to 45 degrees. */
export const FIRST_LIGHT: Level = {
  id: 'first-light',
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
};

/** Splitter at (2,2) turned to 135 degrees lights both crystals. */
export const FORK: Level = {
  id: 'fork',
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
  name: 'Lift',
  size: 6,
  emitter: { col: 3, row: 0, dir: 6 },
  crystals: [],
  blockers: [{ col: 3, row: 5 }],
  tray: [],
  sky: [{ col: 3, row: 3, height: 0.18, color: 0, aperture: 'down' }],
  palm: true,
};

/**
 * Periscope: the beam runs toward you. One palm lifts it at (3,4); the other,
 * higher up, turns it away from you, flat into the crystal hanging over (3,1),
 * whose opening faces you.
 */
export const PERISCOPE: Level = {
  id: 'periscope',
  name: 'Periscope',
  size: 6,
  emitter: { col: 3, row: 0, dir: 6 },
  crystals: [],
  blockers: [{ col: 3, row: 5 }],
  tray: [],
  sky: [{ col: 3, row: 1, height: 0.2, color: 0, aperture: 6 }],
  palm: true,
};

/**
 * Mirror at (3,5) at 45 degrees sends light up column 3; a splitter at (3,2)
 * at 135 degrees feeds the white crystal; a cyan filter at (3,1) colors the rest.
 */
export const PRISM: Level = {
  id: 'prism',
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

export const LEVELS: Level[] = [OPEN_HAND, FIRST_LIGHT, HAND_OFF, FORK, AMBER, LIFT, PERISCOPE, PRISM];
