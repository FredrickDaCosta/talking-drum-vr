import type { PitchBand } from '../app/config.js';
import type { SqueezeTracking } from './hand-squeeze.js';
import type { CalibrationPhase } from './squeeze-calibration.js';

/**
 * Live pitch-hand state, written by SqueezeSystem every frame (before StrikeSystem runs) and read
 * by DrumAudioSystem / the pitch ladder / the debug HUD. `latch*` fields hold the values captured
 * on the most recent strike frame.
 */
export interface PitchHandState {
  hand: 'left' | 'right';
  tracking: SqueezeTracking;
  /** Mean tip-to-knuckle curl in palm lengths this frame (NaN if unusable). */
  rawCurl: number;
  /** Smoothed squeeze 0 (open) .. 1 (fist). */
  squeeze: number;
  band: PitchBand;
  pitchRatio: number;
  calibration: CalibrationPhase;
  calibrationOpenCurl: number;
  calibrationFistCurl: number;
  calibrationFailureReason: string;
  latchedSqueeze: number;
  latchedBand: PitchBand | 'none';
  latchedPitchRatio: number;
  latchedTracking: SqueezeTracking | 'none';
  strikesLatched: number;
}

export const pitchHand: PitchHandState = {
  hand: 'left',
  tracking: 'LOST',
  rawCurl: Number.NaN,
  squeeze: 0.5,
  band: 'M',
  pitchRatio: 1,
  calibration: 'not-started',
  calibrationOpenCurl: Number.NaN,
  calibrationFistCurl: Number.NaN,
  calibrationFailureReason: '',
  latchedSqueeze: Number.NaN,
  latchedBand: 'none',
  latchedPitchRatio: Number.NaN,
  latchedTracking: 'none',
  strikesLatched: 0,
};

/** Captures the current squeeze, band and pitch for a strike and returns the pitch ratio to play. */
export function latchPitchForStrike(state: PitchHandState = pitchHand): number {
  state.latchedSqueeze = state.squeeze;
  state.latchedBand = state.band;
  state.latchedPitchRatio = state.pitchRatio;
  state.latchedTracking = state.tracking;
  state.strikesLatched += 1;
  return state.pitchRatio;
}

declare global {
  interface Window {
    __talkingDrumPitch?: PitchHandState;
  }
}
