import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pointInPolygon } from '../src/placement.ts';

const desk = [
  { x: -0.6, z: -0.3 },
  { x: 0.6, z: -0.3 },
  { x: 0.6, z: 0.3 },
  { x: -0.6, z: 0.3 },
];

test('a point on the desk is inside its outline', () => {
  assert.equal(pointInPolygon(0, 0, desk), true);
  assert.equal(pointInPolygon(0.5, -0.2, desk), true);
});

test('a point beside the desk is outside it', () => {
  assert.equal(pointInPolygon(0.9, 0, desk), false);
  assert.equal(pointInPolygon(0, 0.45, desk), false);
});

test('concave outlines work (an L-shaped desk)', () => {
  const l = [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 1, z: 0.4 },
    { x: 0.4, z: 0.4 },
    { x: 0.4, z: 1 },
    { x: 0, z: 1 },
  ];
  assert.equal(pointInPolygon(0.2, 0.8, l), true);
  assert.equal(pointInPolygon(0.8, 0.8, l), false);
});
