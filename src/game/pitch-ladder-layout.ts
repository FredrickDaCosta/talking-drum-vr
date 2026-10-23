import { APP_CONFIG, type PitchLadderConfig, type PitchConfig } from '../app/config.js';

/** Squeeze value at the centre of each band, used to place the three rungs. */
export function bandCentreSqueezes(
  pitch: PitchConfig = APP_CONFIG.pitch,
): [number, number, number] {
  return [
    pitch.lowBandMax / 2,
    (pitch.lowBandMax + pitch.highBandMin) / 2,
    (pitch.highBandMin + 1) / 2,
  ];
}

/** Height (meters, above the ladder base) of the marker for a squeeze value. */
export function markerHeight(
  squeeze: number,
  ladder: PitchLadderConfig = APP_CONFIG.pitchLadder,
): number {
  const s = Number.isFinite(squeeze) ? Math.min(1, Math.max(0, squeeze)) : 0.5;
  return s * ladder.heightMeters;
}

/**
 * Distances from the default eye position to the ladder's bottom and top for the default drum
 * placement (used by a unit test to enforce the 0.61 m reach rule).
 */
export function ladderReachFromDefaultEye(config = APP_CONFIG): { bottom: number; top: number } {
  const eyeY = config.drumPlacement.defaultEyeLevelMeters;
  const drumY = eyeY - config.drumPlacement.belowEyeLevelMeters;
  const drumZ = -config.drumPlacement.distanceAheadMeters;
  const [ox, oy, oz] = config.pitchLadder.offsetMeters;
  const dist = (y: number): number => Math.hypot(ox, drumY + y - eyeY, drumZ + oz);
  return { bottom: dist(oy), top: dist(oy + config.pitchLadder.heightMeters) };
}
