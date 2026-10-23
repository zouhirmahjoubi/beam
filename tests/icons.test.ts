import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const KIT_TAGS = new Set(['Panel', 'Button', 'ButtonIcon', 'ButtonLabel', 'Divider', 'Text']);

test('every icon the panels use is in the production icon subset', () => {
  const subset = new Set([...readFileSync('src/icons.ts', 'utf8').matchAll(/dist\/([A-Za-z0-9]+)\.js/g)].map((m) => m[1]));
  for (const file of readdirSync('public/ui').filter((f) => f.endsWith('.uikitml'))) {
    const tags = [...readFileSync(`public/ui/${file}`, 'utf8').matchAll(/<([A-Z][A-Za-z0-9]*)(?=[\s/>])/g)].map((m) => m[1]);
    for (const tag of tags) if (!KIT_TAGS.has(tag)) assert.ok(subset.has(tag), `${file}: icon ${tag} is not in src/icons.ts`);
  }
  assert.ok(subset.size >= 10 && subset.size < 60, `subset has ${subset.size} icons`);
});
