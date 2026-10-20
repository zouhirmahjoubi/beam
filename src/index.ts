/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { DepthSensingSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { BoardSystem } from './board.js';
import { solve } from './game/solver.js';
import { PanelSystem } from './panel.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(DepthSensingSystem, {
    configData: { enableDepthTexture: true, enableOcclusion: true, useFloat32: true, blurRadius: 20 },
  });
  world.registerSystem(BoardSystem);
  world.registerSystem(PanelSystem);
  if (import.meta.env.DEV) {
    // Dev-only handle for emulator test scripts.
    (window as unknown as { __palmlight: unknown }).__palmlight = {
      world,
      board: world.getSystem(BoardSystem),
      solve,
    };
  }
});
