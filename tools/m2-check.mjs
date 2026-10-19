#!/usr/bin/env node
// Dev-only: drives emulated hands through the M2 mechanics and prints what the
// board reports. Needs `iwsdk dev up --allow-browser-automation`.
// Usage: node tools/m2-check.mjs
import { execSync } from 'node:child_process';

const cli = (args, env = {}) => {
  const out = execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash' });
  return JSON.parse(out);
};
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const probe = () => cli('browser run tools/probe.mjs').data.result;
const load = (i) => cli('browser run tools/load-level.mjs', { LEVEL: String(i) }).data.result;

// Rotation helpers (unit quaternions as [x, y, z, w]).
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const fromTo = (a, b) => {
  a = norm(a);
  b = norm(b);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.9999) return [0, 0, 1, 0];
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return norm([c[0], c[1], c[2], 1 + d]);
};
const rotate = ([x, y, z, w], v) => {
  const u = [x, y, z];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const t = cross(u, v).map((c) => 2 * c);
  const t2 = cross(u, t);
  return v.map((c, i) => c + w * t[i] + t2[i]);
};

if (!cli('xr status').data.result?.sessionActive && !JSON.stringify(cli('xr status')).includes('"sessionActive":true')) {
  cli('xr enter');
}
cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
sleep(4);

// Measure each hand's palm at the identity pose: normal and center offset from the hand pose.
const calib = {};
for (const [h, device, x] of [[0, 'hand-left', -0.15], [1, 'hand-right', 0.15]]) {
  const pos = { x, y: 1.3, z: -0.3 };
  cli(`xr set-transform --input-json ${json({ device, position: pos, orientation: { x: 0, y: 0, z: 0, w: 1 } })}`);
  sleep(1);
  const s = probe();
  const [bx, by, bz] = s.boardAt;
  const c = s.palms[h].center;
  calib[device] = { n0: s.palms[h].normal, offset: [c[0] + bx - pos.x, c[1] + by - pos.y, c[2] + bz - pos.z] };
}

/** Put a palm's center on a board-local point with the given board-local normal. */
function palmTo(device, local, normal) {
  const s = probe();
  const [bx, by, bz] = s.boardAt; // board yaw is 0 in the emulator
  const q = fromTo(calib[device].n0, normal);
  const o = rotate(q, calib[device].offset);
  const position = { x: bx + local[0] - o[0], y: by + local[1] - o[1], z: bz + local[2] - o[2] };
  cli(`xr set-transform --input-json ${json({ device, position, orientation: { x: q[0], y: q[1], z: q[2], w: q[3] } })}`);
}
const park = (device, x) => cli(`xr set-transform --input-json ${json({ device, position: { x, y: 0.9, z: 0.1 } })}`);
const cell = (col, row, y = 0.036) => [(col - 2.5) * 0.06, y, (row - 2.5) * 0.06];
const report = (label) => {
  const s = probe();
  console.log(label, JSON.stringify({ level: s.level, done: s.completed, cells: s.palmCells.map((c) => c && [c.col, c.row, c.lift]), beams: s.beams, free: s.free, lit: s.litMask, sky: s.skyMask, solved: s.solved }));
  return s;
};

const r2 = Math.SQRT1_2;

// 1. Open Hand: palm at (3,3) facing back toward the emitter and away from you.
load(0);
park('hand-left', -0.4);
palmTo('hand-right', cell(3, 3), [-r2, 0, -r2]);
sleep(1.2);
report('open-hand, palm as mirror:');

// 2. Back of the hand blocks.
palmTo('hand-right', cell(3, 3), [r2, 0, r2]);
sleep(0.6);
report('open-hand, back of hand:');

// 3. Lift: palm at (4,3) tipped up toward the beam, under the floating crystal.
load(5);
palmTo('hand-right', cell(4, 3), [-r2, r2, 0]);
sleep(1.2);
report('lift, palm tipped up:');

// 4. Periscope: right palm lifts at (3,4), left palm turns it away from you at crystal height.
load(6);
palmTo('hand-right', cell(3, 4), [-r2, r2, 0]);
sleep(0.4);
report('periscope, one hand:');
palmTo('hand-left', cell(3, 4, 0.212), [0, -r2, -r2]);
sleep(1.2);
report('periscope, both hands:');
park('hand-left', -0.4);
park('hand-right', 0.4);
