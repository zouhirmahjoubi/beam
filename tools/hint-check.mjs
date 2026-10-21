#!/usr/bin/env node
// Dev-only: checks hints and the daily result card in the emulator.
// Usage: node tools/hint-check.mjs
import { execSync } from 'node:child_process';

const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash', timeout: 90000 }));
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const hint = (mode = 'state') => cli('browser run tools/probe-hint.mjs', { MODE: mode }).data.result;
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${JSON.stringify(detail)})`);
const press = (at) => {
  const [x, y, z] = at;
  cli(`xr set-transform --input-json ${json({ device: 'hand-left', position: { x: -0.15, y: 1.05, z: 0.1 }, orientation: { pitch: 0, yaw: 0, roll: 0 } })}`);
  cli(`xr look-at --input-json ${json({ device: 'hand-left', target: { x, y, z } })}`);
  sleep(0.5);
  cli(`xr set-select-value --input-json ${json({ device: 'hand-left', value: 1 })}`);
  sleep(0.3);
  try {
    cli(`xr set-select-value --input-json ${json({ device: 'hand-left', value: 0 })}`);
  } catch {
    // Sharing ends the session on the press, so there is no release to send.
  }
  sleep(0.8);
};

cli('browser run tools/probe-m3.mjs', { MODE: 'clear' });
cli('browser reload');
sleep(8);
if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
sleep(3);
cli('browser run tools/load-level.mjs', { LEVEL: '1' });
sleep(1);
const ui = cli('browser run tools/probe-ui.mjs').data.result;

// 1. Hints: each press plays the next move now, three per level.
let s = hint();
// The coach may already be playing on its own (a first-time level starts its demo after 2.5 s).
check('A level starts with three hints', s.hintsLeft === 3 && s.hintLabel === 'Hint 3', s);
press(ui.buttons['hint-button']);
s = hint();
check('Hint plays the next move right away', s.playing && s.demo === 'pinch' && s.hintsLeft === 2 && s.hintLabel === 'Hint 2', s);
press(ui.buttons['hint-button']);
press(ui.buttons['hint-button']);
s = hint();
check('Hints run out', s.hintsLeft === 0 && s.hintLabel === 'No hints', s);
cli('browser run tools/load-level.mjs', { LEVEL: '2' });
sleep(1);
s = hint();
check('A new level has fresh hints', s.hintsLeft === 3 && s.level === 'hand-off', s);

// 2. Daily result card: once today's daily is solved, the Daily button shares it.
hint('daily-solve');
sleep(3.5);
s = hint();
check('After the daily, the Daily button offers to share', /^Share 1$/.test(s.dailyLabel), { label: s.dailyLabel, level: s.level });
press(ui.buttons['daily-button']);
sleep(2);
s = hint();
const text = s.sharePage?.text ?? '';
check('Daily share page shows the result card', /^Palmlight daily, \d+ \w+ \d{4}\nLit \d+ crystals? with .*\nStreak: 1 day\nhttps?:\/\//.test(text), { text, link: s.sharePage?.link });
