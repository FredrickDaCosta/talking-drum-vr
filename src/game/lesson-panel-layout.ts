import { APP_CONFIG } from '../app/config.js';

/**
 * Largest distance (meters) from the default eye position to any corner of the lesson panel for
 * the default drum placement (used by a unit test to enforce the 0.61 m reach rule).
 */
export function lessonPanelReachFromDefaultEye(config = APP_CONFIG): number {
  const eyeY = config.drumPlacement.defaultEyeLevelMeters;
  const drumY = eyeY - config.drumPlacement.belowEyeLevelMeters;
  const drumZ = -config.drumPlacement.distanceAheadMeters;
  const { offsetMeters, widthMeters, heightMeters } = config.lessonPanel;
  let max = 0;
  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      const x = offsetMeters[0] + sx * widthMeters;
      const y = drumY + offsetMeters[1] + sy * heightMeters - eyeY;
      const z = drumZ + offsetMeters[2];
      max = Math.max(max, Math.hypot(x, y, z));
    }
  }
  return max;
}
