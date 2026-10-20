#!/usr/bin/env node
// Dev-only: turn on the frame time readout and confirm it updates.
import { execSync } from 'node:child_process';
const cli = (args, env = {}) =>
  JSON.parse(execSync(`npx @iwsdk/cli ${args}`, { encoding: 'utf8', env: { ...process.env, ...env }, shell: 'bash' }));
cli('browser run tools/probe-extra.mjs', { MODE: 'fps-on' });
execSync('sleep 3');
const first = cli('browser run tools/probe-extra.mjs', { MODE: 'fps' }).data.result;
execSync('sleep 2');
const second = cli('browser run tools/probe-extra.mjs', { MODE: 'fps' }).data.result;
const ok = /ms a frame/.test(first.label) && /ms a frame/.test(second.label) && first.visible;
console.log(`${ok ? 'PASS' : 'FAIL'} Frame time readout (${first.label} | ${second.label} | visible ${first.visible})`);
