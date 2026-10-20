import assert from 'node:assert/strict';
import { test } from 'node:test';
import { palmFacesHead } from '../src/palms.ts';

const head = { x: 0, y: 0.42, z: 0.45 };
const center = { x: 0, y: 0.04, z: 0 };

test('a palm turned toward the eyes counts as the system pinch pose', () => {
  const towardHead = { x: 0, y: 0.645, z: 0.764 };
  assert.equal(palmFacesHead(center, towardHead, head), true);
});

test('palms facing the board, the emitter or away from the player are fine', () => {
  assert.equal(palmFacesHead(center, { x: 0, y: -1, z: 0 }, head), false); // flat over the board
  assert.equal(palmFacesHead(center, { x: -1, y: 0, z: 0 }, head), false); // toward the emitter
  assert.equal(palmFacesHead(center, { x: 0, y: 0.707, z: -0.707 }, head), false); // tray tipped away
});
