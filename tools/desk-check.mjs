#!/usr/bin/env node
// Dev-only: checks the Find my desk button in the emulator. Usage: node tools/desk-check.mjs
import { execSync } from 'node:child_process';
const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash', timeout: 90000 }));
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const desk = (mode = 'state') => cli('browser run tools/probe-desk.mjs', { MODE: mode }).data.result;
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${JSON.stringify(detail)})`);
const near = (a, b, d) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < d;

// Fresh player with no saved desk.
desk('clear');
cli('browser reload');
sleep(8);
if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
sleep(5);

let s = desk();
check('Hidden when the browser has no room scan', !s.deskShown && !s.cardVisible && !s.hitVisible, s);

desk('stub');
sleep(1);
s = desk();
check('Shown when no desk was found', s.deskShown && s.cardVisible && s.hitVisible, s);
check('Hit area sits on the button', near(s.hitAt, s.buttonAt, 0.01), { hit: s.hitAt, button: s.buttonAt, scale: s.hitScale, sizes: s.sizes });
// Same row as the bar (board yaw is 0 here), left of it with a small gap.
const [barW, cardW] = s.widths;
const gap = s.barAt[0] - barW / 2 - (s.cardAt[0] + cardW / 2);
check('Card in the bar row, left of it', Math.abs(s.cardAt[1] - s.barAt[1]) < 0.002 && Math.abs(s.cardAt[2] - s.barAt[2]) < 0.002 && gap > 0.005 && gap < 0.02, { card: s.cardAt, bar: s.barAt, widths: s.widths, gap });

desk('desk-on');
sleep(0.5);
s = desk();
check('Hidden once the board is on a desk', !s.deskShown && !s.cardVisible, s);
desk('desk-off');
sleep(0.5);

// Point the left hand at the button and pinch (the right hand's ray would cross the pieces).
s = desk();
const pinchAt = s.now;
const [x, y, z] = s.hitAt;
cli(`xr set-transform --input-json ${json({ device: 'hand-left', position: { x: -0.2, y: 1.0, z: 0.05 }, orientation: { pitch: 0, yaw: 0, roll: 0 } })}`);
cli(`xr look-at --input-json ${json({ device: 'hand-left', target: { x, y, z } })}`);
sleep(0.5);
cli(`xr set-select-value --input-json ${json({ device: 'hand-left', value: 1 })}`);
sleep(0.3);
cli(`xr set-select-value --input-json ${json({ device: 'hand-left', value: 0 })}`);
sleep(1);
s = desk();
check('Pinch starts one room scan and hides the button', s.scans === 1 && s.roomScanUsed && !s.deskShown && !s.hitVisible, s);
// The reseat opens a fresh placement window from the moment the scan ends.
check('Board looks for the new desk', s.placeUntil - pinchAt > 10, { pinchAt, placeUntil: s.placeUntil });
cli(`xr set-transform --input-json ${json({ device: 'hand-left', position: { x: -0.4, y: 0.9, z: 0.1 } })}`);
