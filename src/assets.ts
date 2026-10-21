/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;
export default defineAssets({
  'welcome-panel': {
    url: publicAssetUrl('ui/welcome.uikitml'),
    type: AssetType.UIKitML,
    name: 'Welcome Panel',
  },
  'board-controls': {
    url: publicAssetUrl('ui/controls.uikitml'),
    type: AssetType.UIKitML,
    name: 'Board Controls',
  },
  'pause-panel': {
    url: publicAssetUrl('ui/pause.uikitml'),
    type: AssetType.UIKitML,
    name: 'Pause Panel',
  },
  'desk-panel': {
    url: publicAssetUrl('ui/desk.uikitml'),
    type: AssetType.UIKitML,
    name: 'Find My Desk',
  },
  'hint-panel': {
    url: publicAssetUrl('ui/hint.uikitml'),
    type: AssetType.UIKitML,
    name: 'Level Caption',
  },
  'fps-panel': {
    url: publicAssetUrl('ui/fps.uikitml'),
    type: AssetType.UIKitML,
    name: 'Frame Time Readout',
  },
});
