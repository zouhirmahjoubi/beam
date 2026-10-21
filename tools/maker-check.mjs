#!/usr/bin/env node
// Dev-only: checks the puzzle maker in the emulator. Usage: node tools/maker-check.mjs
import { execSync } from 'node:child_process';
import { decodeLevel } from '../src/game/share.ts';

const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash', timeout: 90000 }));
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const maker = (mode = 'state', cell = 0) => cli('browser run tools/probe-maker.mjs', { MODE: mode, CELL: String(cell) }).data.result;
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${JSON.stringify(detail)})`);
const enter = () => {
  if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
  cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
  sleep(3);
};
/** Point the left hand at a spot and pinch (the right hand's ray would cross the tray). */
const pinchAt = ([x, y, z]) => {
  cli(`xr set-transform --input-json ${json({ device: 'hand-left', position: { x: -0.15, y: 1.05, z: 0.1 }, orientation: { pitch: 0, yaw: 0, roll: 0 } })}`);
  cli(`xr look-at --input-json ${json({ device: 'hand-left', target: { x, y, z } })}`);
  sleep(0.4);
  cli(`xr set-select-value --input-json ${json({ device: 'hand-left', value: 1 })}`);
  sleep(0.3);
  try {
    cli(`xr set-select-value --input-json ${json({ device: 'hand-left', value: 0 })}`);
  } catch {
    // Share ends the session on the press, so there is no release to send.
  }
  sleep(0.6);
};
const CRYSTAL = 4 * 6 + 4; // (4,4): off the light's starting line, so pieces are needed

cli('browser run tools/probe-m3.mjs', { MODE: 'clear' });
cli('browser reload');
sleep(8);
enter();

let s = maker();
check('Cells are out of reach outside the maker', s.tilesUp === 0 && !s.making, { tilesUp: s.tilesUp });
pinchAt(s.buttons['make-button']);
s = maker('state', CRYSTAL);
check('Make opens the maker with the palette and its bar', s.making && s.tray === 6 && !s.controlsVisible && s.makerVisible && s.tilesUp === 36, s);
check('Maker caption asks for blocks and crystals', s.caption === 'Pinch cells to add blocks and crystals', { caption: s.caption });

// Two pinches on one cell: a block, then a white crystal.
pinchAt(s.tileAt);
pinchAt(s.tileAt);
s = maker('state', CRYSTAL);
const crystal = s.draft.crystals[0];
check('Pinching a cell twice makes a crystal', s.draft.crystals.length === 1 && crystal.col === 4 && crystal.row === 4 && crystal.color === 0 && s.draft.blockers.length === 0, s.draft);
check('Caption asks to light it', s.caption === 'Light every crystal with your pieces', { caption: s.caption });

// Share is refused until the maker lights it.
pinchAt(s.buttons['maker-share']);
s = maker('state', CRYSTAL);
check('Share waits for the maker to light every crystal', s.making && s.sharePage === null && s.caption === 'Light every crystal with your pieces', { caption: s.caption, page: s.sharePage });

maker('solve');
sleep(1.5);
s = maker('state', CRYSTAL);
check('Lighting it makes the puzzle ready to share', s.makerSolved && s.caption === 'Solved. Press Share to send it' && s.making, { solved: s.makerSolved, caption: s.caption });

// A reload (the way back if the headset cannot re-enter) keeps the puzzle and its pieces.
const placedBefore = s.placed;
cli('browser reload');
sleep(8);
enter();
sleep(1);
s = maker('state', CRYSTAL);
check('Reload keeps the puzzle being made', s.making && s.draft.crystals.length === 1 && s.placed === placedBefore && s.makerSolved, { making: s.making, placed: s.placed, placedBefore, solved: s.makerSolved });

// Share ends the session and the page shows a link to this puzzle.
pinchAt(s.buttons['maker-share']);
sleep(2);
const session = JSON.stringify(cli('xr status'));
s = maker('state', CRYSTAL);
const code = s.sharePage ? new URL(s.sharePage).searchParams.get('p') : null;
const shared = code ? decodeLevel(code) : null;
check('Share ends the headset session', /"sessionActive":\s*false/.test(session), {});
check('Share page holds a link to this puzzle', !!shared && shared.crystals.length === 1 && shared.crystals[0].col === 4 && shared.tray.length > 0 && s.search === `?p=${code}`, { link: s.sharePage, search: s.search });

// Back in the headset the maker is still there; Done returns to the chapter.
maker('close-page');
enter();
// The emulated hand still holds the pinch that ended the session; a real hand opens.
cli(`xr set-select-value --input-json ${json({ device: 'hand-left', value: 0 })}`);
s = maker('state', CRYSTAL);
check('Back in the headset, still making', s.making && s.draft.crystals.length === 1, { making: s.making });
pinchAt(s.buttons['maker-done']);
s = maker();
check('Done returns to the chapter level', !s.making && s.level === 'open-hand' && s.controlsVisible && s.tilesUp === 0, s);

// Make again reopens the last puzzle.
pinchAt(s.buttons['make-button']);
s = maker('state', CRYSTAL);
check('Make reopens the last puzzle', s.making && s.draft.crystals.length === 1 && s.draft.crystals[0].col === 4, s.draft);
pinchAt(s.buttons['maker-done']);
