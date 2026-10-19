#!/usr/bin/env node
// Dev-only: look at a mirror, pinch, carry it to a cell and let go.
// Usage: node tools/m2-grab.mjs
import { execSync } from 'node:child_process';

const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash' }));
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const probe = () => cli('browser run tools/probe.mjs').data.result;
const show = (label) => {
  const s = probe();
  console.log(label, JSON.stringify({ level: s.level, held: s.held, placed: s.placed, ok: s.candidateOk, pieces: s.pieces }));
  return s;
};

if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
cli('browser run tools/load-level.mjs', { LEVEL: '1' });
cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
// Quest 3 and 3S have no eye tracking: IWSDK aims with the head instead.
const LOOK = process.env.LOOK ?? 'headset';
sleep(2);
let s = show('start:');
const [px, py, pz] = s.pieces[0];

// Rest the right hand low and to the side, then look at the first mirror and pinch.
cli(`xr set-transform --input-json ${json({ device: 'hand-right', position: { x: 0.25, y: 1.05, z: -0.15 } })}`);
cli(`xr look-at --input-json ${json({ device: LOOK, target: { x: px, y: py + 0.02, z: pz } })}`);
sleep(1);
cli(`xr set-select-value --input-json ${json({ device: 'hand-right', value: 1 })}`);
sleep(1.5);
s = show('looked and pinched:');

// Carry it over cell (2,4) by moving the hand by the board offset, then let go.
const [bx, by, bz] = s.boardAt;
const target = { x: bx + (2 - 2.5) * 0.06, z: bz + (4 - 2.5) * 0.06 };
const piece = s.pieces[0];
const hand = { x: 0.25 + (target.x - piece[0]), y: 1.05 + (by + 0.012 - piece[1]), z: -0.15 + (target.z - piece[2]) };
cli(`xr animate-to --input-json ${json({ device: 'hand-right', position: hand, duration: 0.8 })}`);
sleep(2.5);
show('carried over (2,4):');
cli(`xr set-select-value --input-json ${json({ device: 'hand-right', value: 0 })}`);
sleep(1);
show('released:');
