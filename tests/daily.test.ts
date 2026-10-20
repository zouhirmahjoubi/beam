import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixedCells, inBounds } from '../src/game/grid.ts';
import { generateDaily, hashKey, mulberry32, needsWholeTray } from '../src/game/daily.ts';
import { dayKey } from '../src/progress.ts';

test('the generator is deterministic for a day', () => {
  assert.deepEqual(generateDaily('2026-11-03'), generateDaily('2026-11-03'));
  assert.notDeepEqual(generateDaily('2026-11-03'), generateDaily('2026-11-04'));
  const a = mulberry32(hashKey('x'));
  const b = mulberry32(hashKey('x'));
  assert.equal(a(), b());
});

test('a full year of daily puzzles is solvable and needs every tray piece', () => {
  const start = new Date(2026, 9, 20);
  const kinds = new Set<string>();
  for (let i = 0; i < 366; i++) {
    const day = dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const level = generateDaily(day);
    assert.equal(level.id, `daily-${day}`);
    assert.equal(level.name, 'Daily puzzle', `${day}: fell back to the backup board`);
    const fixed = 1 + level.crystals.length + level.blockers.length;
    assert.equal(fixedCells(level).size, fixed, `${day}: fixed pieces overlap`);
    for (const k of fixedCells(level)) {
      const [c, r] = k.split(',').map(Number);
      assert.ok(inBounds(level.size, c, r), `${day}: piece off the board`);
    }
    assert.ok(needsWholeTray(level), `${day}: unsolvable, or solvable with fewer pieces`);
    for (const t of level.tray) kinds.add(t.kind);
  }
  // Across a year every piece type shows up.
  assert.deepEqual([...kinds].sort(), ['filter', 'mirror', 'splitter']);
});
