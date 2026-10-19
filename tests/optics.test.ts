import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apertureVector, freeTrace, reflect3, type PalmDisc, type SkyTarget, type V3 } from '../src/game/optics.ts';

const near = (a: V3, b: V3, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const n = (x: number, y: number, z: number): V3 => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

test('reflect3 mirrors a ray about a surface normal', () => {
  assert.ok(near(reflect3([1, 0, 0], [-1, 0, 0]), [-1, 0, 0]));
  assert.ok(near(reflect3([1, 0, 0], n(-1, 1, 0)), [0, 1, 0]));
});

test('aperture vectors point the way the opening faces', () => {
  assert.ok(near(apertureVector('down'), [0, -1, 0]));
  assert.ok(near(apertureVector(4), [-1, 0, 0]));
  assert.ok(near(apertureVector(2), [0, 0, -1]));
});

const downCrystal: SkyTarget = { center: [0, 0.2, 0], radius: 0.03, aperture: [0, -1, 0], color: 0 };

test('a lifted beam enters a crystal that opens downward', () => {
  const r = freeTrace([0, 0, 0], [0, 1, 0], 0, [], [downCrystal]);
  assert.equal(r.end, 'target');
  assert.equal(r.hit, 0);
  assert.ok(Math.abs(r.points[1][1] - 0.17) < 1e-6);
});

test('light from the wrong side bounces off the crystal shell', () => {
  const r = freeTrace([-0.3, 0.2, 0], [1, 0, 0], 0, [], [downCrystal]);
  assert.equal(r.end, 'closed');
  assert.equal(r.hit, -1);
});

test('two palms make a periscope into a side-facing crystal', () => {
  const upper: PalmDisc = { center: [0, 0.25, 0], normal: n(1, -1, 0), radius: 0.06 };
  const side: SkyTarget = { center: [0.2, 0.25, 0], radius: 0.03, aperture: [-1, 0, 0], color: 0 };
  const r = freeTrace([0, 0, 0], [0, 1, 0], 0, [upper], [side]);
  assert.equal(r.end, 'target');
  assert.deepEqual(r.palmHits, [0]);
  assert.equal(r.points.length, 3);
});

test('the back of a hand stops a free beam', () => {
  const palm: PalmDisc = { center: [0, 0.1, 0], normal: [0, 1, 0], radius: 0.06 };
  const r = freeTrace([0, 0, 0], [0, 1, 0], 0, [palm], [downCrystal]);
  assert.equal(r.end, 'hand');
  assert.deepEqual(r.palmHits, [0]);
});

test('the palm that lifted the beam is skipped', () => {
  const lifter: PalmDisc = { center: [0, 0, 0], normal: n(-1, 1, 0), radius: 0.06 };
  const r = freeTrace([0, 0, 0], [0, 1, 0], 0, [lifter], [downCrystal], 0);
  assert.equal(r.end, 'target');
});

test('a beam that hits nothing fades out at its maximum length', () => {
  const r = freeTrace([0, 0, 0], [0, 1, 0], 0, [], [], -1, 0.5);
  assert.equal(r.end, 'miss');
  assert.ok(near(r.points[1], [0, 0.5, 0]));
});

test('colored sky crystals need their color', () => {
  const amber: SkyTarget = { ...downCrystal, color: 2 };
  assert.equal(freeTrace([0, 0, 0], [0, 1, 0], 1, [], [amber]).end, 'wrong-color');
  assert.equal(freeTrace([0, 0, 0], [0, 1, 0], 2, [], [amber]).end, 'target');
});
