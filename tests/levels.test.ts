import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixedCells, inBounds, type Level } from '../src/game/grid.ts';
import { LEVELS, OPEN_HAND, PERISCOPE, FIRST_LIGHT } from '../src/game/levels.ts';
import { pathCells, solve } from '../src/game/solver.ts';

test('pathCells walks straight and diagonal segments', () => {
  assert.deepEqual(pathCells([{ col: 0, row: 4 }, { col: 2, row: 4 }]), [
    { col: 1, row: 4 },
    { col: 2, row: 4 },
  ]);
  assert.deepEqual(pathCells([{ col: 0, row: 0 }, { col: 2, row: 2 }]).length, 2);
  assert.deepEqual(pathCells([{ col: 4, row: 1 }, { col: 5.5, row: 1 }]), [{ col: 5, row: 1 }]);
});

test('level ids are unique and every fixed piece sits on the board', () => {
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
  for (const level of LEVELS) {
    const fixed = 1 + level.crystals.length + level.blockers.length;
    assert.equal(fixedCells(level).size, fixed, `${level.id} has overlapping fixed pieces`);
    for (const k of fixedCells(level)) {
      const [c, r] = k.split(',').map(Number);
      assert.ok(inBounds(level.size, c, r), `${level.id} has a piece off the board`);
    }
  }
});

for (const level of LEVELS) {
  test(`${level.id} can be solved`, () => {
    assert.ok(solve(level), `${level.id} has no solution`);
  });
}

test('levels without a palm flag cannot be solved by hand alone', () => {
  const handOnly = (l: Level): Level => ({ ...l, tray: [] });
  assert.equal(solve(handOnly(FIRST_LIGHT), 0), null);
});

test('Open Hand needs the palm', () => {
  assert.equal(solve(OPEN_HAND, 0), null);
});

test('Periscope needs both hands', () => {
  assert.equal(solve(PERISCOPE, 1), null);
  assert.ok(solve(PERISCOPE, 2));
});
