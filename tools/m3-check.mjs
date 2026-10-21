#!/usr/bin/env node
// Dev-only: checks M3 in the emulator. Usage: node tools/m3-check.mjs
import { execSync } from 'node:child_process';
const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash', timeout: 90000 }));
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const m3 = (mode = 'state') => cli('browser run tools/probe-m3.mjs', { MODE: mode }).data.result;
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${JSON.stringify(detail)})`);
const enter = () => {
  if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
  cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
};
const reload = () => {
  cli('browser reload');
  sleep(8);
  enter();
  sleep(3);
};

// Fresh player: Open Hand, its caption, then the ghost hand after a short pause.
m3('clear');
reload();
let s = m3();
check('Fresh start on Open Hand with its caption', s.level === 'open-hand' && s.hintVisible === true, s);
sleep(3);
// The ghost fades out for part of each loop, so sample a few times.
for (let tries = 0; tries < 4; tries++) {
  s = m3();
  if (s.ghostVisible[0]) break;
  sleep(0.7);
}
check('Ghost hand shows the palm move', s.coachPlaying && s.ghostVisible[0] && s.demo === 'palm', s);

// Save and resume: a mirror placed on First Light survives a reload.
m3('place');
reload();
s = m3();
check('Resume puts the level and mirror back', s.level === 'first-light' && JSON.stringify(s.placed[0]) === '[2,4,1]', s);

// Daily puzzle: solving it starts a streak and the save remembers it.
m3('daily-solve');
sleep(0.6);
s = m3();
// The board returns to the chapter 2.6 s after a solve, so check right away.
check('Daily puzzle solves and starts a streak', s.streak === 1 && (s.daily ? s.solved : true), s);
sleep(3);
s = m3();
check('After the daily, back to the chapter level', !s.daily && s.level === 'first-light', s);

// Desk memory: on a desk, the spot is saved after the placement window and comes back next session.
m3('desk-on');
sleep(5);
s = m3();
const before = s.boardAt;
check('Desk spot saved as a persistent anchor', s.deskSaved && s.anchor === 'saved', s);
cli('xr exit');
sleep(2);
enter();
sleep(4);
s = m3();
check('Desk spot restored next session', s.deskRestored && JSON.stringify(s.boardAt) === JSON.stringify(before), { before, after: s.boardAt, restored: s.deskRestored });
