import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS } from '../src/game/levels.ts';
import { decodeLevel, encodeLevel } from '../src/game/share.ts';
import { solve } from '../src/game/solver.ts';

const boardLevels = LEVELS.filter((l) => !l.sky?.length);
const bytesOf = (code: string) => [...Buffer.from(code, 'base64url')];
const codeOf = (bytes: number[]) => Buffer.from(bytes).toString('base64url');

test('every board level survives a share code round trip', () => {
  for (const level of boardLevels) {
    const code = encodeLevel(level);
    const back = decodeLevel(code);
    assert.ok(back, `${level.id}: did not decode`);
    assert.deepEqual(back.emitter, level.emitter, level.id);
    assert.deepEqual(back.crystals, level.crystals, level.id);
    assert.deepEqual(back.blockers, level.blockers, level.id);
    assert.deepEqual(back.tray, level.tray, level.id);
    assert.equal(back.palm ?? false, level.palm ?? false, level.id);
    if (level.palm) assert.equal(back.hands, level.hands ?? 2, level.id);
    assert.ok(code.length <= 40, `${level.id}: code is ${code.length} characters`);
  }
});

test('a shared level is still solvable', () => {
  const level = decodeLevel(encodeLevel(LEVELS[1]));
  assert.ok(level && solve(level));
});

test('sky levels refuse to encode', () => {
  const sky = LEVELS.find((l) => l.sky?.length);
  assert.ok(sky);
  assert.throws(() => encodeLevel(sky));
});

test('malformed codes decode to null', () => {
  const good = bytesOf(encodeLevel(LEVELS[1]));
  const bad = (label: string, edit: (b: number[]) => void) => {
    const b = [...good];
    edit(b);
    assert.equal(decodeLevel(codeOf(b)), null, label);
  };
  assert.equal(decodeLevel(''), null, 'empty');
  assert.equal(decodeLevel('not a code!'), null, 'bad characters');
  assert.equal(decodeLevel('A'.repeat(500)), null, 'too long');
  bad('wrong version', (b) => (b[0] = 2));
  bad('wrong board size', (b) => (b[1] = 7));
  bad('emitter off the board', (b) => (b[2] = 6 * 16));
  bad('three hands', (b) => (b[3] = (b[3] & 7) | (3 << 3)));
  bad('no crystals', (b) => b.splice(4, 1 + 2 * b[4], 0));
  bad('crystal on the emitter', (b) => (b[5] = b[2]));
  bad('unknown color', (b) => (b[6] = 3));
  // First Light allows no hands; an empty tray then leaves nothing to place.
  bad('nothing to place', (b) => b.splice(b.length - 3, 3, 0));
  bad('trailing byte', (b) => b.push(0));
  bad('cut short', (b) => b.pop());
  bad('filter with no color', (b) => (b[b.length - 1] = 2));
  bad('mirror with a color', (b) => (b[b.length - 1] = 0 | (1 << 2)));
  bad('unknown piece kind', (b) => (b[b.length - 1] = 3));
});
