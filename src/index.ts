import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { trackStartupWithBanner } from './app/loading-banner.js';
import { installAudioResumeOnVisible, installAudioUnlockListeners } from './audio/audio-unlock.js';
import { DrumAudioSystem } from './audio/drum-audio-system.js';
import { StrikeSystem } from './game/strike-system.js';
import { PanelSystem } from './panel.js';
import { configureLocalXrVisuals } from './platform/xr-profiles.js';

installAudioUnlockListeners(document);
installAudioResumeOnVisible(document);

void trackStartupWithBanner(
  World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then(
    (world) => {
      configureLocalXrVisuals(world);
      world.registerSystem(PanelSystem);
      world.registerSystem(StrikeSystem);
      world.registerSystem(DrumAudioSystem);
      return world;
    },
  ),
  document.getElementById('app-loading-banner'),
);
