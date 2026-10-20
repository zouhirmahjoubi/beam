import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixedCells, inBounds, type Level } from '../src/game/grid.ts';
import { LEVELS, OPEN_HAND, PERISCOPE, FIRST_LIGHT } from '../src/game/levels.ts';
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

const facesHead = (level: Level, col: number, row: number, normal: number[]) => {
  const at = cellPoint(level.size, col, row, BOARD_TOP + 0.024);
  const toHead = unit([HEAD[0] - at[0], HEAD[1] - at[1], HEAD[2] - at[2]]);
  return dot3(normal, toHead) >= Math.cos(Math.PI / 3);
};

for (const level of LEVELS.filter((l) => l.palm)) {
  test(`${level.id} never needs a palm facing the player`, () => {
    const safe = (p: { col: number; row: number; nx: number; nz: number }) => !facesHead(level, p.col, p.row, unit([p.nx, 0, p.nz]));
    const solution = solve(level, undefined, safe);
    assert.ok(solution, `${level.id} has no solution`);
    const sky = level.sky ?? [];
    // A sky crystal only one periscope reaches: the lift palm sends light straight up.
    const twoHands = sky.length > 0 && solve(level, 1, safe) === null;
    solution.palms.forEach((palm) => {
      const at = cellPoint(level.size, palm.col, palm.row, BOARD_TOP + 0.024);
      let normal: number[];
      if (!palm.lift) {
        normal = unit([palm.nx, 0, palm.nz]);
      } else {
        // Incoming beam runs opposite the flattened palm normal.
        const d = unit([-palm.nx, 0, -palm.nz]);
        const target = sky[0] ? cellPoint(level.size, sky[0].col, sky[0].row, BOARD_TOP + sky[0].height) : at;
        const out = twoHands ? [0, 1, 0] : unit([target[0] - at[0], target[1] - at[1], target[2] - at[2]]);
        normal = unit([out[0] - d[0], out[1] - d[1], out[2] - d[2]]);
      }
      const toHead = unit([HEAD[0] - at[0], HEAD[1] - at[1], HEAD[2] - at[2]]);
      assert.ok(dot3(normal, toHead) < Math.cos(Math.PI / 3), `${level.id}: palm at (${palm.col},${palm.row}) faces the player`);
    });
    // The upper palm of a periscope turns the rising beam into the opening.
    if (twoHands) {
      const s = sky[0];
      const opening = apertureVector(s.aperture);
      const upper = unit([-opening[0] - 0, -opening[1] - 1, -opening[2] - 0]);
      const at = cellPoint(level.size, s.col, s.row, BOARD_TOP + s.height);
      const toHead = unit([HEAD[0] - at[0], HEAD[1] - at[1], HEAD[2] - at[2]]);
      assert.ok(dot3(upper, toHead) < Math.cos(Math.PI / 3), `${level.id}: upper palm faces the player`);
    }
  });
}
