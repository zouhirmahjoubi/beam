#!/usr/bin/env node
// Dev-only: checks the accessibility pack in the emulator: one-hand mode (a
// palm held still pins in place), reduced motion, high contrast, and the
// settings bar. Usage: node tools/access-check.mjs
import { execSync } from 'node:child_process';

const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash', timeout: 90000 }));
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const access = (mode = 'state', env = {}) => cli('browser run tools/probe-access.mjs', { MODE: mode, ...env }).data.result;
const set = (key, value) => access('set', { KEY: key, VALUE: value });
const probe = () => cli('browser run tools/probe.mjs').data.result;
const load = (i) => cli('browser run tools/load-level.mjs', { LEVEL: String(i) }).data.result;
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${JSON.stringify(detail)})`);

// Rotation helpers (unit quaternions as [x, y, z, w]), as in m2-check.mjs.
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

cli('browser run tools/probe-m3.mjs', { MODE: 'clear' });
cli('browser reload');
sleep(8);
if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
sleep(4);

// Calibrate the right palm at the identity pose: its normal and center offset from the hand pose.
const device = 'hand-right';
const pos0 = { x: 0.15, y: 1.3, z: -0.3 };
cli(`xr set-transform --input-json ${json({ device, position: pos0, orientation: { x: 0, y: 0, z: 0, w: 1 } })}`);
sleep(1);
let s = probe();
const c0 = s.palms[1].center;
const calib = { n0: s.palms[1].normal, offset: [c0[0] + s.boardAt[0] - pos0.x, c0[1] + s.boardAt[1] - pos0.y, c0[2] + s.boardAt[2] - pos0.z] };
const palmTo = (local, normal) => {
  const st = probe();
  const [bx, by, bz] = st.boardAt;
  const q = fromTo(calib.n0, normal);
  const o = rotate(q, calib.offset);
  const position = { x: bx + local[0] - o[0], y: by + local[1] - o[1], z: bz + local[2] - o[2] };
  cli(`xr set-transform --input-json ${json({ device, position, orientation: { x: q[0], y: q[1], z: q[2], w: q[3] } })}`);
};
const park = () => cli(`xr set-transform --input-json ${json({ device, position: { x: 0.4, y: 0.9, z: 0.1 } })}`);
const cell = (col, row, y = 0.036) => [(col - 2.5) * 0.06, y, (row - 2.5) * 0.06];
const r2 = Math.SQRT1_2;
cli(`xr set-transform --input-json ${json({ device: 'hand-left', position: { x: -0.4, y: 0.9, z: 0.1 } })}`);

// 1. Defaults.
s = access();
check('Settings start off', !s.settings.oneHand && s.settings.reducedMotion === null && !s.settings.highContrast && s.beamGlowWidth === 1, s.settings);

// 2. One-hand mode off: a still palm never pins.
load(6); // Periscope: a lifted palm at (3,4), then a second palm above it.
palmTo(cell(3, 4), [0, r2, -r2]);
sleep(2.5);
s = access();
check('A still palm does not pin with one-hand mode off', s.pins === 0 && s.palmCells[1]?.[2] === true, { pins: s.pins, cells: s.palmCells });

// 3. One-hand mode on: holding the lifted palm still pins it, and the same hand then solves from above.
set('oneHand', 'on');
sleep(2.5);
s = access();
check('A still palm pins in one-hand mode', s.pins === 1 && s.pinGhosts === 1 && s.settings.oneHand && s.savedSettings?.oneHand === true, { pins: s.pins, ghosts: s.pinGhosts });
park();
sleep(0.8);
s = access();
check('The pin stays when the hand leaves', s.pins === 1, { pins: s.pins });
palmTo(cell(3, 4, 0.212), [0, -r2, -r2]);
sleep(1.5);
s = access();
check('Periscope solved with one hand', s.solved || s.completed.includes('periscope'), { solved: s.solved, completed: s.completed, level: s.level });
park();
sleep(3.5);
s = access();
check('Pins clear on the next level', s.pins === 0 && s.level !== 'periscope', { pins: s.pins, level: s.level });

// 4. Reduced motion: the ghost hand holds a pose instead of looping.
set('reducedMotion', 'on');
cli('browser reload');
sleep(8);
if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
sleep(4);
s = access();
check('Reduced motion survives a reload', s.settings.reducedMotion === true && s.reducedMotion === true, s.settings);
sleep(2);
const g1 = access('ghost');
sleep(1.1);
const g2 = access('ghost');
check('Ghost hand holds still with reduced motion', g1.visible && g2.visible && JSON.stringify(g1.at) === JSON.stringify(g2.at) && g1.opacity > 0.2, { g1, g2 });
set('reducedMotion', 'off');
sleep(1.5);
const g3 = access('ghost');
sleep(0.9);
const g4 = access('ghost');
check('Ghost hand moves again without it', JSON.stringify(g3.at) !== JSON.stringify(g4.at) || g3.opacity !== g4.opacity, { g3, g4 });

// 5. High contrast: wider, brighter beams.
set('highContrast', 'on');
sleep(0.5);
s = access();
check('High contrast widens and brightens the beam', s.beamGlowWidth > 1.5 && s.beamGlowOpacity > 0.5, { width: s.beamGlowWidth, opacity: s.beamGlowOpacity });
set('highContrast', 'off');
sleep(0.5);
s = access();
check('High contrast off restores the beam', s.beamGlowWidth === 1 && s.beamGlowOpacity < 0.5, { width: s.beamGlowWidth, opacity: s.beamGlowOpacity });

// 6. Settings bar: the gear swaps the bar, labels show the state, Back returns.
const ui = cli('browser run tools/probe-ui.mjs').data.result;
const press = (at) => {
  const [x, y, z] = at;
  cli(`xr set-transform --input-json ${json({ device: 'hand-left', position: { x: -0.15, y: 1.05, z: 0.1 }, orientation: { pitch: 0, yaw: 0, roll: 0 } })}`);
  cli(`xr look-at --input-json ${json({ device: 'hand-left', target: { x, y, z } })}`);
  sleep(0.5);
  cli(`xr set-select-value --input-json ${json({ device: 'hand-left', value: 1 })}`);
  sleep(0.3);
  cli(`xr set-select-value --input-json ${json({ device: 'hand-left', value: 0 })}`);
  sleep(0.8);
};
press(ui.buttons['settings-button']);
s = access();
check('Settings opens its own bar', s.settingsVisible && !s.controlsVisible && s.labels.oneHand === 'One hand on', { visible: s.settingsVisible, labels: s.labels });
press(ui.buttons['settings-onehand']);
s = access();
check('One hand toggles from the bar', !s.settings.oneHand && s.labels.oneHand === 'One hand off', { settings: s.settings, labels: s.labels });
press(ui.buttons['settings-back']);
s = access();
check('Back returns the main bar', !s.settingsVisible && s.controlsVisible, { visible: s.settingsVisible, controls: s.controlsVisible });
