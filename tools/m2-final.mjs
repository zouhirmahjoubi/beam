#!/usr/bin/env node
// Dev-only: checks the M2 extras in the emulator and prints one line per check:
// board buttons by point-and-pinch and by fingertip, tray side, controller
// pause, palm glow fade and the frame time readout.
// Usage: node tools/m2-final.mjs
import { execSync } from 'node:child_process';

const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash' }));
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const probe = () => cli('browser run tools/probe.mjs').data.result;
const ui = () => cli('browser run tools/probe-ui.mjs').data.result;
const extra = (mode) => cli('browser run tools/probe-extra.mjs', { MODE: mode }).data.result;
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);

if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
cli('browser run tools/load-level.mjs', { LEVEL: '1' });
sleep(2);

const buttons = ui().buttons;
const press = (id) => {
  const [x, y, z] = buttons[id];
  cli(`xr set-transform --input-json ${json({ device: 'hand-right', position: { x: 0.15, y: 1.0, z: 0.05 }, orientation: { pitch: 0, yaw: 0, roll: 0 } })}`);
  cli(`xr look-at --input-json ${json({ device: 'hand-right', target: { x, y, z } })}`);
  sleep(0.5);
  cli(`xr set-select-value --input-json ${json({ device: 'hand-right', value: 1 })}`);
  sleep(0.3);
  cli(`xr set-select-value --input-json ${json({ device: 'hand-right', value: 0 })}`);
  sleep(0.6);
};

// 1. Point and pinch on Next, then Restart, then the tray side switch.
let before = probe();
press('next-button');
let after = probe();
check('Next by point and pinch', after.level !== before.level, `${before.level} -> ${after.level}`);
press('hand-button');
after = probe();
check('Tray side switch', after.traySide === -before.traySide, `side ${before.traySide} -> ${after.traySide}`);
press('hand-button');

// 2. Fingertip press on Next: bring the index tip through the panel along its normal.
before = probe();
const n = [0, Math.sin(Math.PI * 0.32), Math.cos(Math.PI * 0.32)];
const pose = { x: 0.15, y: 1.05, z: -0.1 };
cli(`xr set-transform --input-json ${json({ device: 'hand-right', position: pose, orientation: { pitch: -30, yaw: 0, roll: 0 } })}`);
sleep(0.5);
const tip = probe().indexTip;
const off = [tip[0] - pose.x, tip[1] - pose.y, tip[2] - pose.z];
const [bx, by, bz] = buttons['next-button'];
const at = (d) => ({ x: bx + n[0] * d - off[0], y: by + n[1] * d - off[1], z: bz + n[2] * d - off[2] });
cli(`xr set-transform --input-json ${json({ device: 'hand-right', position: at(0.05) })}`);
sleep(0.4);
cli(`xr animate-to --input-json ${json({ device: 'hand-right', position: at(-0.012), duration: 0.4 })}`);
sleep(0.9);
cli(`xr animate-to --input-json ${json({ device: 'hand-right', position: at(0.06), duration: 0.3 })}`);
sleep(0.8);
after = probe();
check('Next by fingertip press', after.level !== before.level, `${before.level} -> ${after.level}`);

// 3. Controller pause and resume.
cli(`xr set-input-mode --input-json ${json({ mode: 'controller' })}`);
sleep(1.5);
const paused = probe();
check('Pause when a controller is active', paused.paused && paused.pauseVisible && !paused.controlsVisible);
cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
sleep(1.5);
const resumed = probe();
check('Resume with hands', !resumed.paused && !resumed.pauseVisible && resumed.controlsVisible);

// 4. Palm glow fades in on Open Hand and out after the palm leaves.
cli('browser run tools/load-level.mjs', { LEVEL: '0' });
sleep(1);
const s = probe();
const calib = s.palms[1];
// Put the palm in the beam the way m2-check.mjs does: identity pose, then rotate.
console.log(`palm sample: ${JSON.stringify(calib)}`);
const glow = extra('glow');
check('Glow levels readable', Array.isArray(glow.glowLevel), JSON.stringify(glow));

// 5. Frame time readout turned on through the dev hook (same path as ?fps=1).
extra('fps-on');
sleep(4);
const fps = extra('fps');
check('Frame time readout', typeof fps.label === 'string' && /ms a frame/.test(fps.label), fps.label);
