import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canPlace,
  lineFromNormal,
  reflect,
  trace,
  type Level,
  type PalmCell,
  type Piece,
} from '../src/game/grid.ts';
import { FIRST_LIGHT } from '../src/game/levels.ts';

const open: Level = {
  id: 'open',
  name: 'Open',
  size: 6,
  emitter: { col: 0, row: 4, dir: 0 },
  crystals: [{ col: 4, row: 1, color: 0 }],
  blockers: [],
  tray: [{ kind: 'mirror' }, { kind: 'mirror' }],
};

const mirror = (col: number, row: number, angle: number): Piece => ({ kind: 'mirror', col, row, angle });

test('reflect follows the mirror line', () => {
  assert.equal(reflect(0, 1), 2); // right into "/" goes away from the player
  assert.equal(reflect(2, 1), 0); // away into "/" goes right
  assert.equal(reflect(0, 3), 6); // right into "\" comes toward the player
  assert.equal(reflect(0, 2), 4); // square-on mirror bounces it back
  assert.equal(reflect(0, 0), null); // edge-on passes through
  assert.equal(reflect(0, 4), null);
  assert.equal(reflect(1, 5), null);
});

test('mirror angles repeat every 180 degrees', () => {
  for (let dir = 0; dir < 8; dir++) {
    for (let angle = 0; angle < 4; angle++) {
      assert.equal(reflect(dir as 0, angle), reflect(dir as 0, angle + 4));
    }
  }
});

test('no pieces: beam runs to the board edge', () => {
  const r = trace(open, []);
  assert.equal(r.beams.length, 1);
  assert.equal(r.beams[0].end, 'edge');
  assert.equal(r.solved, false);
  assert.deepEqual(r.beams[0].points.at(-1), { col: 5.5, row: 4 });
});

test('two mirrors light the crystal', () => {
  const r = trace(open, [mirror(2, 4, 1), mirror(2, 1, 1)]);
  assert.equal(r.solved, true);
  assert.deepEqual(r.beams[0].points, [
    { col: 0, row: 4 },
    { col: 2, row: 4 },
    { col: 2, row: 1 },
    { col: 4, row: 1 },
  ]);
});

test('blockers stop the beam at the cell edge', () => {
  const r = trace(FIRST_LIGHT, []);
  assert.equal(r.beams[0].end, 'blocker');
  assert.deepEqual(r.beams[0].points.at(-1), { col: 3.5, row: 4 });
});

test('a splitter sends the beam both ways', () => {
  const level: Level = {
    ...open,
    crystals: [
      { col: 5, row: 4, color: 0 },
      { col: 2, row: 0, color: 0 },
    ],
    tray: [{ kind: 'splitter' }],
  };
  const r = trace(level, [{ kind: 'splitter', col: 2, row: 4, angle: 1 }]);
  assert.equal(r.beams.length, 2);
  assert.deepEqual([...r.lit].sort(), [0, 1]);
  assert.equal(r.solved, true);
});

test('a filter recolors the beam and colored crystals need their color', () => {
  const level: Level = { ...open, crystals: [{ col: 5, row: 4, color: 2 }], tray: [{ kind: 'filter', color: 2 }] };
  assert.equal(trace(level, []).solved, false); // white light does not light an amber crystal
  const r = trace(level, [{ kind: 'filter', col: 2, row: 4, angle: 0, color: 2 }]);
  assert.equal(r.beams.at(-1)!.color, 2); // the filter starts a new amber beam
  assert.equal(r.solved, true);
});

test('white crystals accept any color', () => {
  const level: Level = { ...open, crystals: [{ col: 5, row: 4, color: 0 }] };
  const r = trace(level, [{ kind: 'filter', col: 2, row: 4, angle: 0, color: 1 }]);
  assert.equal(r.solved, true);
});

test('a palm facing the beam reflects it like a mirror', () => {
  // Palm faces back toward the emitter and away from the player: a "/" line.
  const palm: PalmCell = { col: 2, row: 4, nx: -Math.SQRT1_2, nz: -Math.SQRT1_2, lift: false };
  assert.equal(lineFromNormal(palm.nx, palm.nz) % 4, 1);
  const r = trace(open, [mirror(2, 1, 1)], [palm]);
  assert.equal(r.solved, true);
  assert.equal(r.palmHits[0], true);
});

test('the back of the hand blocks the beam', () => {
  const back: PalmCell = { col: 2, row: 4, nx: Math.SQRT1_2, nz: Math.SQRT1_2, lift: false };
  const r = trace(open, [mirror(2, 1, 1)], [back]);
  assert.equal(r.beams[0].end, 'hand');
  assert.equal(r.solved, false);
});

test('a palm facing down only blocks the beam', () => {
  const down: PalmCell = { col: 2, row: 4, nx: -0.7, nz: -0.7, lift: false, block: true };
  assert.equal(trace(open, [mirror(2, 1, 1)], [down]).beams[0].end, 'hand');
});

test('a palm tilted up lifts the beam off the board', () => {
  const lift: PalmCell = { col: 3, row: 4, nx: -0.6, nz: 0, lift: true };
  const r = trace(open, [], [lift]);
  assert.equal(r.beams[0].end, 'lift');
  assert.deepEqual(r.beams[0].lift, { col: 3, row: 4, dir: 0, palm: 0, color: 0 });
});

test('a closed mirror loop ends instead of hanging', () => {
  const loop: Level = { ...open, emitter: { col: 0, row: 0, dir: 0 }, crystals: [] };
  const r = trace(loop, [mirror(2, 0, 3), mirror(2, 2, 1), mirror(0, 2, 3)]);
  assert.ok(['loop', 'emitter'].includes(r.beams[0].end));
});

test('splitter loops stay bounded', () => {
  const level: Level = { ...open, emitter: { col: 0, row: 0, dir: 0 }, crystals: [] };
  const r = trace(level, [
    { kind: 'splitter', col: 2, row: 0, angle: 3 },
    { kind: 'splitter', col: 2, row: 2, angle: 1 },
    { kind: 'splitter', col: 0, row: 2, angle: 3 },
  ]);
  assert.ok(r.beams.length <= 12);
});

test('pieces cannot go on fixed pieces, other pieces or off the board', () => {
  const placed = [mirror(2, 4, 1)];
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 0, row: 4 }), false);
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 4, row: 2 }), false);
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 2, row: 4 }), false);
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 2, row: 4 }, 0), true);
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 6, row: 0 }), false);
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 3, row: 3 }), true);
});
