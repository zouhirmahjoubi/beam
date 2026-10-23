/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Production builds get only the icons the panels use: the UI kit imports the
// whole Lucide set as a namespace, which no tree-shaking can trim (4 MB raw).
const production = process.env.NODE_ENV === 'production';
const iconSubset = fileURLToPath(new URL('./src/icons.ts', import.meta.url));
// Likewise three's rect area light tables (240 KB) for a light type the game never uses.
const rectAreaStub = fileURLToPath(new URL('./src/stubs/rect-area-light-uniforms.ts', import.meta.url));

export default defineConfig({
  plugins: [iwsdkDev()],
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (three@0.185 vs app super-three@0.181). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    alias: production
      ? [
          { find: /^@pmndrs\/uikit-lucide$/, replacement: iconSubset },
          { find: /^three\/examples\/jsm\/lights\/RectAreaLightUniformsLib\.js$/, replacement: rectAreaStub },
        ]
      : [],
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
