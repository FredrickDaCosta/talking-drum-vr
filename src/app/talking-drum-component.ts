import { createComponent, Types } from '@iwsdk/core';
import { APP_CONFIG } from './config.js';

export const TalkingDrum = createComponent('TalkingDrum', {
  distanceAheadMeters: {
    type: Types.Float32,
    default: APP_CONFIG.drumPlacement.distanceAheadMeters,
  },
  belowEyeLevelMeters: {
    type: Types.Float32,
    default: APP_CONFIG.drumPlacement.belowEyeLevelMeters,
  },
});
