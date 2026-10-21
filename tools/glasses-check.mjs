#!/usr/bin/env node
// Dev-only: checks Palmlight on the emulated Meta VR Glasses: the narrower view
// and gaze plus pinch. Swaps the emulator device in iwsdk.config.json for the
// run and puts it back after. Usage: node tools/glasses-check.mjs
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash', timeout: 90000 }));
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const glasses = (mode = 'state') => cli('browser run tools/probe-glasses.mjs', { MODE: mode }).data.result;
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${JSON.stringify(detail)})`);
/** The glasses' view, from IWER's metaVRGlasses mask: 37 degrees each side, 25 up, 43 down. */
const MASK = { side: 37, up: 25, down: 43 };
const fits = (ext) => !!ext && ext.yaw[0] > -MASK.side && ext.yaw[1] < MASK.side && ext.pitch[1] < MASK.up && ext.pitch[0] > -MASK.down;

const CONFIG = 'iwsdk.config.json';
const original = readFileSync(CONFIG, 'utf8');
const setDevice = (device) => {
  const cfg = JSON.parse(original);
  cfg.dev.emulator.device = device;
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
};
/** The injected emulator device is fixed at start-up, so a device change needs a fresh runtime. */
const restart = () => /READY/.test(execSync('bash tools/emulator-up.sh', { encoding: 'utf8', shell: 'bash', timeout: 400000 }));
const enter = () => {
  if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
  cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
  sleep(3);
};
const park = () => {
  cli(`xr set-transform --input-json ${json({ device: 'hand-left', position: { x: -0.4, y: 0.85, z: 0.3 } })}`);
  cli(`xr set-transform --input-json ${json({ device: 'hand-right', position: { x: 0.4, y: 0.85, z: 0.3 } })}`);
};
const pinch = () => {
  cli(`xr set-select-value --input-json ${json({ device: 'hand-right', value: 1 })}`);
  sleep(0.3);
  cli(`xr set-select-value --input-json ${json({ device: 'hand-right', value: 0 })}`);
  sleep(0.8);
};

try {
  setDevice('metaVRGlasses');
  if (!restart()) throw new Error('the emulator did not start as the glasses');
  cli('browser run tools/probe-m3.mjs', { MODE: 'clear' });
  cli('browser reload');
  sleep(8);
  enter();
  park();
  sleep(2);

  let s = glasses();
  check('Emulator runs as Meta VR Glasses with gaze', s.profile?.device === 'metaVRGlasses' && s.gazeEnabled && s.gazeSource, {
    profile: s.profile,
    gazeEnabled: s.gazeEnabled,
    gazeSource: s.gazeSource,
    features: s.enabledFeatures,
  });

  // Seated at the desk, looking at the board: everything must sit inside the narrower view.
  const ui = cli('browser run tools/probe-ui.mjs').data.result;
  const [bx, by, bz] = ui.buttons['next-button'];
  cli(`xr set-transform --input-json ${json({ device: 'headset', position: { x: 0, y: 1.5, z: 0.25 } })}`);
  cli(`xr look-at --input-json ${json({ device: 'headset', target: { x: 0, y: by + 0.05, z: bz - 0.12 } })}`);
  sleep(1);
  s = glasses();
  for (const [name, ext] of Object.entries(s.view)) check(`${name} fits the glasses view`, fits(ext), ext);

  // Gaze at Next, pinch with the right hand: the level advances.
  const before = s.level;
  cli(`xr look-at --input-json ${json({ device: 'gaze', target: { x: bx, y: by, z: bz } })}`);
  sleep(0.6);
  pinch();
  s = glasses();
  check('Gaze at Next and pinch advances the level', s.level !== before, { before, after: s.level });

  // Gaze at a tray piece, pinch and hold: the piece is held.
  const pieces = glasses('pieces').pieces;
  const [px, py, pz] = pieces[0];
  cli(`xr look-at --input-json ${json({ device: 'gaze', target: { x: px, y: py, z: pz } })}`);
  sleep(0.6);
  cli(`xr set-select-value --input-json ${json({ device: 'hand-right', value: 1 })}`);
  sleep(0.8);
  const held = glasses('pieces').held;
  cli(`xr set-select-value --input-json ${json({ device: 'hand-right', value: 0 })}`);
  sleep(0.5);
  check('Gaze at a piece and pinch picks it up', held === 1, { held, piece: pieces[0] });

  cli('browser screenshot --output-file tools/out/glasses-view.png');
  console.log('screenshot: tools/out/glasses-view.png');
} finally {
  writeFileSync(CONFIG, original);
  // Leave the runtime down: the next check starts it fresh as the Quest 3.
  try {
    execSync('npx @iwsdk/cli dev down', { encoding: 'utf8', shell: 'bash', timeout: 90000 });
  } catch {
    // Already down.
  }
  console.log('emulator device restored');
}
