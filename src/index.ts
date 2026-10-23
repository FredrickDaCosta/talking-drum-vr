import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { trackStartupWithBanner } from './app/loading-banner.js';
import { installAudioResumeOnVisible, installAudioUnlockListeners } from './audio/audio-unlock.js';
import { DrumAudioSystem } from './audio/drum-audio-system.js';
import { LessonSystem } from './game/lesson-system.js';
import { PitchLadderSystem } from './game/pitch-ladder-system.js';
import { StrikeSystem } from './game/strike-system.js';
import { SqueezeSystem } from './input/squeeze-system.js';
import { PanelSystem } from './panel.js';
import { configureLocalXrVisuals } from './platform/xr-profiles.js';

installAudioUnlockListeners(document);
installAudioResumeOnVisible(document);

void trackStartupWithBanner(
  World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then(
    (world) => {
      configureLocalXrVisuals(world);
      world.registerSystem(PanelSystem);
      // SqueezeSystem must run before StrikeSystem so a strike latches this frame's squeeze.
      world.registerSystem(SqueezeSystem);
      world.registerSystem(StrikeSystem);
      world.registerSystem(DrumAudioSystem);
      // After DrumAudioSystem: its strike listener latches the band this one reads.
      world.registerSystem(LessonSystem);
      world.registerSystem(PitchLadderSystem);
      return world;
    },
  ),
  document.getElementById('app-loading-banner'),
);
