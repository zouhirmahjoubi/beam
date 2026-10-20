import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixedCells, inBounds, type Level } from '../src/game/grid.ts';
import { BOTH_HANDS, LEVELS, OPEN_HAND, PERISCOPE, FIRST_LIGHT } from '../src/game/levels.ts';
import { cellPoint, pathCells, solve } from '../src/game/solver.ts';
import { apertureVector } from '../src/game/optics.ts';

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

for (const level of LEVELS) {
  test(`${level.id} needs every tray piece`, () => {
    for (let i = 0; i < level.tray.length; i++) {
      const fewer = { ...level, tray: level.tray.filter((_, j) => j !== i) };
      assert.equal(solve(fewer), null, `${level.id} still solves without ${level.tray[i].kind}`);
    }
  });
}

test('Both Hands needs both hands', () => {
  assert.equal(solve(BOTH_HANDS, 1), null);
  assert.ok(solve(BOTH_HANDS, 2));
});

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

/**
 * The Quest reserves a pinch made with the palm facing the headset (on the
 * left hand it exits the session), so no level may need a palm pointed
 * within 60 degrees of a seated player's eyes.
 */
const BOARD_TOP = 0.012;
const HEAD: [number, number, number] = [0, 0.42, 0.45]; // FALLBACK_DROP above, REACH behind the board center
const unit = (v: number[]) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const safePose = (at: number[], normal: number[]) => {
  const toHead = unit([HEAD[0] - at[0], HEAD[1] - at[1], HEAD[2] - at[2]]);
  return dot3(normal, toHead) < Math.cos(Math.PI / 3);
};

for (const level of LEVELS.filter((l) => l.palm || l.sky?.length)) {
  test(`${level.id} never needs a palm facing the player`, () => {
    assert.ok(solve(level, undefined, safePose as never), `${level.id}: every answer needs a palm facing the player`);
  });
}
