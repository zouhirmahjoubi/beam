import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canPlace, reflect, trace, type Level } from '../src/game/grid.ts';
import { LEVELS, FIRST_LIGHT } from '../src/game/levels.ts';

const open: Level = {
  id: 'open',
  name: 'Open',
  size: 6,
  emitter: { col: 0, row: 4, dir: 0 },
  crystals: [{ col: 4, row: 1 }],
  blockers: [],
  mirrors: 2,
};

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

test('no mirrors: beam runs to the board edge', () => {
  const r = trace(open, []);
  assert.equal(r.end, 'edge');
  assert.equal(r.solved, false);
  assert.deepEqual(r.points.at(-1), { col: 5.5, row: 4 });
});

test('two mirrors light the crystal', () => {
  const r = trace(open, [
    { col: 2, row: 4, angle: 1 },
    { col: 2, row: 1, angle: 1 },
  ]);
  assert.equal(r.end, 'crystal');
  assert.equal(r.solved, true);
  assert.deepEqual(r.points, [
    { col: 0, row: 4 },
    { col: 2, row: 4 },
    { col: 2, row: 1 },
    { col: 4, row: 1 },
  ]);
});

test('blockers stop the beam at the cell edge', () => {
  const r = trace(FIRST_LIGHT, []);
  assert.equal(r.end, 'blocker');
  assert.deepEqual(r.points.at(-1), { col: 3.5, row: 4 });
});

test('First Light has the documented solution', () => {
  const r = trace(FIRST_LIGHT, [
    { col: 2, row: 4, angle: 1 },
    { col: 2, row: 1, angle: 5 },
  ]);
  assert.equal(r.solved, true);
});

test('the direct column route is blocked in First Light', () => {
  const r = trace(FIRST_LIGHT, [{ col: 3, row: 4, angle: 1 }]);
  assert.equal(r.solved, false);
});

test('a closed mirror loop ends instead of hanging', () => {
  const loop: Level = { ...open, emitter: { col: 0, row: 0, dir: 0 }, crystals: [] };
  const r = trace(loop, [
    { col: 2, row: 0, angle: 3 },
    { col: 2, row: 2, angle: 1 },
    { col: 0, row: 2, angle: 3 },
  ]);
  assert.ok(['loop', 'emitter'].includes(r.end));
});

test('mirrors cannot go on fixed pieces, other mirrors or off the board', () => {
  const placed = [{ col: 2, row: 4, angle: 1 }];
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 0, row: 4 }), false);
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 4, row: 2 }), false);
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 2, row: 4 }), false);
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 2, row: 4 }, 0), true);
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 6, row: 0 }), false);
  assert.equal(canPlace(FIRST_LIGHT, placed, { col: 3, row: 3 }), true);
});

test('every level is solvable with its tray', () => {
  for (const level of LEVELS) {
    assert.ok(solve(level), `${level.id} has no solution`);
  }
});

/** Brute force: try every cell and angle for each mirror (fine for small trays). */
function solve(level: Level): boolean {
  const cells: Array<{ col: number; row: number }> = [];
  for (let col = 0; col < level.size; col++) {
    for (let row = 0; row < level.size; row++) {
      if (canPlace(level, [], { col, row })) cells.push({ col, row });
    }
  }
  const search = (placed: Array<{ col: number; row: number; angle: number }>): boolean => {
    if (trace(level, placed).solved) return true;
    if (placed.length === level.mirrors) return false;
    for (const cell of cells) {
      if (placed.some((m) => m.col === cell.col && m.row === cell.row)) continue;
      for (let angle = 0; angle < 4; angle++) {
        if (search([...placed, { ...cell, angle }])) return true;
      }
    }
    return false;
  };
  return search([]);
}
