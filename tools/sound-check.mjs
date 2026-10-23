#!/usr/bin/env node
// Dev-only: checks that sounds play from their spot on the desk and that the
// listener rides on the player's head. Usage: node tools/sound-check.mjs
import { execSync } from 'node:child_process';

const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash', timeout: 90000 }));
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const sound = () => cli('browser run tools/probe-sound.mjs').data.result;
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${JSON.stringify(detail)})`);
const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : Infinity);

// A fresh page, so the sound log holds only this check's sounds.
cli('browser reload');
sleep(8);
if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
cli(`xr set-transform --input-json ${json({ device: 'headset', position: { x: 0.05, y: 1.52, z: 0.22 } })}`);
sleep(2);
cli('browser run tools/load-level.mjs', { LEVEL: '1' });
sleep(1);
// HOLD keeps the solved level on the board, so the probe compares against the right crystal.
cli('browser run tools/probe-maker.mjs', { MODE: 'solve', HOLD: '1' });
sleep(1.2);
const s = sound();
check('The crystal note plays from the crystal', s.recent.some((at) => s.crystals.some((c) => dist(c, at) < 0.03)), { recent: s.recent, crystals: s.crystals });
check('The solved chord plays from the board', s.recent.some((at) => dist(at, s.center) < 0.03), { recent: s.recent, center: s.center });
check('The listener sits on the head', dist(s.listener, s.head) < 0.02, { listener: s.listener, head: s.head });
