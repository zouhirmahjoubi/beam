#!/usr/bin/env node
// Dev-only: checks opening a shared puzzle from a link in the emulator.
// Usage: node tools/share-check.mjs
import { execSync } from 'node:child_process';
import { LEVELS } from '../src/game/levels.ts';
import { encodeLevel } from '../src/game/share.ts';

const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash', timeout: 90000 }));
const json = (o) => `'${JSON.stringify(o)}'`;
const sleep = (s) => execSync(`sleep ${s}`);
const share = (mode = 'state', code = '') => cli('browser run tools/probe-share.mjs', { MODE: mode, CODE: code }).data.result;
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${JSON.stringify(detail)})`);
const reload = () => {
  cli('browser reload');
  sleep(8);
  if (!/"sessionActive":\s*true/.test(JSON.stringify(cli('xr status')))) cli('xr enter');
  cli(`xr set-input-mode --input-json ${json({ mode: 'hand' })}`);
  sleep(3);
};

// A fresh player opens a link to Two Colors (three pieces, so one placed piece leaves it unsolved).
const code = encodeLevel(LEVELS.find((l) => l.id === 'two-colors'));
cli('browser run tools/probe-m3.mjs', { MODE: 'clear' });
share('link', code);
reload();
let s = share();
check('Link opens the shared puzzle', s.level === `shared-${code}` && s.shared && s.saveBoard === s.level, s);
check('Link leaves the address bar', s.search === '', { search: s.search });

// The puzzle survives a reload without the link.
share('place');
reload();
s = share();
check('Reload resumes the shared puzzle and its pieces', s.level === `shared-${code}` && s.placed === 1, s);

// Solving it returns to the chapter on its own (2.6 s, faster than the CLI can look),
// and counts toward neither the chapter nor the streak.
share('solve');
sleep(3);
s = share();
check('Solved, then back to the chapter level', s.level === 'open-hand' && !s.extra && s.completed.length === 0 && !s.streak, s);

// A broken link falls back to the chapter with a short notice, cleared on the next board.
share('link', 'AQYBroken');
reload();
s = share();
check('Broken link shows a notice on the chapter level', s.level === 'open-hand' && s.notice === 'That puzzle link did not work' && s.search === '', s);
share('next');
s = share();
check('Notice clears on the next board', s.notice === null, s);
