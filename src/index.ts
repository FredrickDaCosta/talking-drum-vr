import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { APP_CONFIG } from './app/config.js';
import { applyDebugOverrides } from './app/debug-overrides.js';
import { trackStartupWithBanner } from './app/loading-banner.js';
import { getAppFlags } from './app/flags.js';
import { installAudioResumeOnVisible, installAudioUnlockListeners } from './audio/audio-unlock.js';
import { DrumAudioSystem } from './audio/drum-audio-system.js';
import { DesktopModeSystem } from './desktop/desktop-mode-system.js';
import { VrDebugPanelSystem } from './debug/vr-debug-panel-system.js';
import { AdaptivePlacementSystem } from './game/adaptive-placement-system.js';
import { LessonSystem } from './game/lesson-system.js';
import { PitchLadderSystem } from './game/pitch-ladder-system.js';
import { StrikeSystem } from './game/strike-system.js';
import { SqueezeSystem } from './input/squeeze-system.js';
import { PanelSystem } from './panel.js';
import { configureLocalXrVisuals } from './platform/xr-profiles.js';

installAudioUnlockListeners(document);
installAudioResumeOnVisible(document);

// Before any system reads APP_CONFIG: ?debug=1-only numeric tuning overrides for a Quest session.
window.__talkingDrumOverrides = applyDebugOverrides(
  window.location.search,
  getAppFlags().debug,
  APP_CONFIG,
);

void trackStartupWithBanner(
  World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then(
    (world) => {
      configureLocalXrVisuals(world);
      world.registerSystem(PanelSystem);
      // Before StrikeSystem (and everything else keyed off the drum's live transform): re-places
      // the drum relative to the player's head once a VR session's pose settles.
      world.registerSystem(AdaptivePlacementSystem);
      // SqueezeSystem must run before StrikeSystem so a strike latches this frame's squeeze.
      world.registerSystem(SqueezeSystem);
      world.registerSystem(StrikeSystem);
      world.registerSystem(DrumAudioSystem);
      // After DrumAudioSystem: its strike listener latches the band this one reads.
      world.registerSystem(LessonSystem);
      world.registerSystem(PitchLadderSystem);
      // Desktop play (mouse / keyboard / touch) where VR is unavailable or ?mode=desktop; inert in XR.
      world.registerSystem(DesktopModeSystem);
      // In-VR debug panel: only built with ?debug=1, so it does not exist otherwise.
      if (getAppFlags().debug) {
        world.registerSystem(VrDebugPanelSystem);
      }
      return world;
    },
  ),
  document.getElementById('app-loading-banner'),
);
