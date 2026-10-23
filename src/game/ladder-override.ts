import type { PitchBand } from '../app/config.js';

/**
 * Lets the lesson demo drive the pitch ladder: while `active`, the ladder shows `band` (marker at
 * the band centre, that rung lit) instead of the live squeeze. Written by LessonSystem, read by
 * PitchLadderSystem.
 */
export const ladderOverride: { active: boolean; band: PitchBand } = {
  active: false,
  band: 'M',
};
