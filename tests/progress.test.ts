import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  currentStreak,
  dayKey,
  emptySave,
  loadProgress,
  previousDay,
  recordDailySolve,
  saveProgress,
  type KeyValueStore,
} from '../src/progress.ts';

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

test('progress survives a save and load', () => {
  const store = memory();
  const save = { ...emptySave('open-hand'), levelId: 'fork', boardId: 'fork', completed: ['open-hand'], traySide: -1 as const };
  save.placed = [{ col: 2, row: 4, angle: 1 }, null];
  saveProgress(save, store);
  assert.deepEqual(loadProgress('open-hand', store), save);
});

test('a missing, broken or old save starts fresh', () => {
  assert.deepEqual(loadProgress('open-hand', memory()), emptySave('open-hand'));
  const broken = memory();
  broken.setItem('palmlight.save.v1', '{not json');
  assert.deepEqual(loadProgress('open-hand', broken), emptySave('open-hand'));
  const old = memory();
  old.setItem('palmlight.save.v1', JSON.stringify({ version: 0, levelId: 'fork' }));
  assert.equal(loadProgress('open-hand', old).levelId, 'open-hand');
  assert.deepEqual(loadProgress('open-hand', null), emptySave('open-hand'));
});

test('a store that throws never breaks the game', () => {
  const angry: KeyValueStore = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
  };
  assert.doesNotThrow(() => saveProgress(emptySave('open-hand'), angry));
  assert.deepEqual(loadProgress('open-hand', angry), emptySave('open-hand'));
});

test('day keys are local calendar days and step back across months and years', () => {
  assert.equal(dayKey(new Date(2026, 9, 5)), '2026-10-05');
  assert.equal(previousDay('2026-11-01'), '2026-10-31');
  assert.equal(previousDay('2027-01-01'), '2026-12-31');
  assert.equal(previousDay('2028-03-01'), '2028-02-29');
});

test('streaks grow on consecutive days, reset after a gap and count once a day', () => {
  let daily = emptySave('x').daily;
  daily = recordDailySolve(daily, '2026-11-01');
  assert.deepEqual(daily, { crystals: 0, pieces: 0, palms: 0, lastSolved: '2026-11-01', streak: 1, best: 1 });
  daily = recordDailySolve(daily, '2026-11-01');
  assert.equal(daily.streak, 1);
  daily = recordDailySolve(daily, '2026-11-02');
  daily = recordDailySolve(daily, '2026-11-03');
  assert.deepEqual(daily, { crystals: 0, pieces: 0, palms: 0, lastSolved: '2026-11-03', streak: 3, best: 3 });
  daily = recordDailySolve(daily, '2026-11-05');
  assert.deepEqual(daily, { crystals: 0, pieces: 0, palms: 0, lastSolved: '2026-11-05', streak: 1, best: 3 });
});

test('the shown streak drops to zero once a full day is missed', () => {
  const daily = { crystals: 0, pieces: 0, palms: 0, lastSolved: '2026-11-03', streak: 3, best: 3 };
  assert.equal(currentStreak(daily, '2026-11-03'), 3);
  assert.equal(currentStreak(daily, '2026-11-04'), 3);
  assert.equal(currentStreak(daily, '2026-11-05'), 0);
});

test('broken saved pieces load as empty tray slots', () => {
  const store = memory();
  store.setItem(
    'palmlight.save.v1',
    JSON.stringify({
      version: 1,
      levelId: 'first-light',
      boardId: 'first-light',
      placed: [{ col: 'x', row: 4, angle: 1 }, { col: 2, row: 4, angle: 1 }, { col: -1, row: 0, angle: 0 }, 7],
      chapterPlaced: 'nope',
      completed: ['open-hand', 3],
    }),
  );
  const save = loadProgress('open-hand', store);
  assert.deepEqual(save.placed, [null, { col: 2, row: 4, angle: 1 }, null, null]);
  assert.deepEqual(save.chapterPlaced, []);
  assert.deepEqual(save.completed, ['open-hand']);
});

test('the puzzle being made survives a reload, and a bad one is dropped', () => {
  const store = memory();
  const save = { ...emptySave('open-hand'), maker: 'AQYAAgFEAAAGAAAAAQIGCg' };
  saveProgress(save, store);
  assert.equal(loadProgress('open-hand', store).maker, 'AQYAAgFEAAAGAAAAAQIGCg');
  store.setItem('palmlight.save.v1', JSON.stringify({ ...save, maker: 42 }));
  assert.equal(loadProgress('open-hand', store).maker, null);
  assert.equal(emptySave('open-hand').maker, null);
});

test('settings save, load, and drop bad values', () => {
  const store = memory();
  assert.deepEqual(emptySave('open-hand').settings, { oneHand: false, reducedMotion: null, highContrast: false });
  const save = { ...emptySave('open-hand'), settings: { oneHand: true, reducedMotion: false, highContrast: true } };
  saveProgress(save, store);
  assert.deepEqual(loadProgress('open-hand', store).settings, save.settings);
  store.setItem('palmlight.save.v1', JSON.stringify({ ...save, settings: { oneHand: 'yes', reducedMotion: 1, highContrast: true } }));
  assert.deepEqual(loadProgress('open-hand', store).settings, { oneHand: false, reducedMotion: null, highContrast: true });
  store.setItem('palmlight.save.v1', JSON.stringify({ ...save, settings: null }));
  assert.deepEqual(loadProgress('open-hand', store).settings, emptySave('open-hand').settings);
});
