import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyCard } from '../src/game/daily-card.ts';

const url = 'https://zouhirmahjoubi.github.io/palmlight/';

test('the daily card reads well and gives nothing away', () => {
  const card = dailyCard({ day: '2026-10-21', crystals: 3, pieces: 2, palms: 1, streak: 5, url });
  assert.equal(
    card,
    ['Palmlight daily, 21 Oct 2026', 'Lit 3 crystals with 2 pieces and 1 palm.', 'Streak: 5 days', url].join('\n'),
  );
  assert.ok(!/mirror|splitter|filter|\(\d, ?\d\)/i.test(card), 'no piece names or cells');
});

test('counts read naturally', () => {
  const line = (o: { crystals?: number; pieces?: number; palms?: number; streak?: number }) =>
    dailyCard({ day: '2026-01-05', crystals: 1, pieces: 1, palms: 0, streak: 1, url, ...o }).split('\n');
  assert.equal(line({})[1], 'Lit 1 crystal with 1 piece.');
  assert.equal(line({ palms: 2, pieces: 0 })[1], 'Lit 1 crystal with both palms.');
  assert.equal(line({ palms: 1, pieces: 0 })[1], 'Lit 1 crystal with 1 palm.');
  assert.equal(line({ pieces: 3, palms: 2 })[1], 'Lit 1 crystal with 3 pieces and both palms.');
  assert.equal(line({})[2], 'Streak: 1 day');
  assert.equal(line({})[0], 'Palmlight daily, 5 Jan 2026');
});
