import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { StrikeSystem } from './game/strike-system.js';
import { PanelSystem } from './panel.js';
import { configureLocalXrVisuals } from './platform/xr-profiles.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then(
  (world) => {
    configureLocalXrVisuals(world);
    world.registerSystem(PanelSystem);
    world.registerSystem(StrikeSystem);
  },
);
