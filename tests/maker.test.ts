import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS } from '../src/game/levels.ts';
import { checkShare, emptyDraft, moveLight, tapCell, type Draft } from '../src/game/maker.ts';
import { decodeLevel, MAX_CRYSTALS } from '../src/game/share.ts';
import { solve } from '../src/game/solver.ts';

const firstLight = LEVELS.find((l) => l.id === 'first-light')!;
const draftOf = (l: typeof firstLight): Draft => ({ emitter: { ...l.emitter }, crystals: [...l.crystals], blockers: [...l.blockers] });
const contentAt = (d: Draft, col: number, row: number) =>
  d.blockers.some((b) => b.col === col && b.row === row)
    ? 'blocker'
    : (d.crystals.find((c) => c.col === col && c.row === row)?.color ?? 'empty');

test('a new draft has only the light', () => {
  const d = emptyDraft();
  assert.equal(d.crystals.length, 0);
  assert.equal(d.blockers.length, 0);
});

test('tapping a cell cycles blocker, white, cyan and amber crystal, then empty', () => {
  let d = emptyDraft();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    d = tapCell(d, 3, 3);
    seen.push(contentAt(d, 3, 3));
  }
  assert.deepEqual(seen, ['blocker', 0, 1, 2, 'empty']);
});

test('tapping the light turns it 45 degrees', () => {
  const d = emptyDraft();
  const turned = tapCell(d, d.emitter.col, d.emitter.row);
  assert.equal(turned.emitter.dir, (d.emitter.dir + 1) % 8);
  assert.equal(tapCell(turned, d.emitter.col, d.emitter.row).emitter.dir, (d.emitter.dir + 2) % 8);
});

test('the light moves only to an empty cell', () => {
  const d = tapCell(emptyDraft(), 4, 4);
  assert.deepEqual(moveLight(d, 4, 4), d, 'blocked cell');
  const moved = moveLight(d, 5, 0);
  assert.equal(moved.emitter.col, 5);
  assert.equal(moved.emitter.row, 0);
  assert.equal(moved.emitter.dir, d.emitter.dir);
});

test('crystals stop at the share limit', () => {
  let d = emptyDraft();
  for (const [col, row] of [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [5, 4]]) d = tapCell(tapCell(d, col, row), col, row);
  assert.equal(d.crystals.length, MAX_CRYSTALS);
  d = tapCell(tapCell(d, 2, 0), 2, 0);
  assert.equal(contentAt(d, 2, 0), 'empty', 'past the limit the crystal step is skipped');
});

test('share needs a crystal, the maker to light it, and pieces doing the work', () => {
  const answer = solve(firstLight)!.pieces;
  assert.deepEqual(checkShare(emptyDraft(), []), { ok: false, reason: 'Add a crystal first' });
  assert.deepEqual(checkShare(draftOf(firstLight), []), { ok: false, reason: 'Light every crystal with your pieces' });
  assert.deepEqual(checkShare(draftOf(firstLight), answer.slice(0, 1)), { ok: false, reason: 'Light every crystal with your pieces' });

  // A crystal straight in front of the light needs no pieces at all.
  const easy: Draft = { emitter: { col: 0, row: 2, dir: 0 }, crystals: [{ col: 4, row: 2, color: 0 }], blockers: [] };
  assert.deepEqual(checkShare(easy, []), { ok: false, reason: 'The light already reaches every crystal' });

  const result = checkShare(draftOf(firstLight), answer);
  assert.ok(result.ok);
  const shared = decodeLevel(result.code);
  assert.ok(shared);
  assert.deepEqual(shared.tray, answer.map((p) => ({ kind: p.kind })));
  assert.deepEqual(shared.crystals, firstLight.crystals);
  assert.ok(solve(shared));
});
