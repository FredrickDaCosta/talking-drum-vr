import { APP_CONFIG, type SqueezeConfig } from '../app/config.js';
import { OneEuroFilter3D } from './one-euro-filter.js';

/**
 * Squeeze (0 = open hand, 1 = tight fist) for the pitch hand, computed from WebXR hand joints.
 *
 * Metric: for each of index, middle, ring and pinky, the distance from the finger tip to that
 * finger's own knuckle (`*-phalanx-proximal`), divided by the palm length (wrist to middle-finger
 * knuckle); the mean over valid fingers is the hand's "curl" in palm lengths.
 * - Tip-to-own-knuckle measures finger flexion only, so wrist bend and palm pose do not leak in.
 * - The palm (wrist to middle knuckle) is rigid, about 9-10 cm, so it normalises hand size with
 *   little noise. In WebXR the `*-metacarpal` joints sit at the base of the metacarpal bone near the
 *   wrist, so wrist-to-middle-metacarpal is only about 3.5 cm and amplifies tracking jitter (and it
 *   varies by 8% across the IWER reference poses, while wrist-to-knuckle does not vary).
 * The thumb is excluded: its position in a fist varies a lot between people.
 * Squeeze maps curl linearly between calibrated open and fist values and clamps to [0, 1].
 */

/** Joint order used by `computeHandCurlInto` (x, y, z per joint). */
export const SQUEEZE_JOINTS = [
  'wrist',
  'index-finger-phalanx-proximal',
  'index-finger-tip',
  'middle-finger-phalanx-proximal',
  'middle-finger-tip',
  'ring-finger-phalanx-proximal',
  'ring-finger-tip',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-tip',
] as const satisfies readonly XRHandJoint[];

export const SQUEEZE_JOINT_COUNT = SQUEEZE_JOINTS.length;

const WRIST = 0;
const MIDDLE_KNUCKLE = 3;
const FINGER_COUNT = 4;

export interface HandCurlResult {
  /** Mean tip-to-knuckle distance over valid fingers, in palm lengths (NaN if unusable). */
  curl: number;
  /** Wrist to middle-finger knuckle distance in meters (NaN if unavailable). */
  palmLengthMeters: number;
  validFingers: number;
}

function jointDistance(p: ArrayLike<number>, a: number, b: number): number {
  const ax = p[a * 3];
  const ay = p[a * 3 + 1];
  const az = p[a * 3 + 2];
  const bx = p[b * 3];
  const by = p[b * 3 + 1];
  const bz = p[b * 3 + 2];
  return Math.hypot(ax - bx, ay - by, az - bz);
}

/**
 * Computes the hand curl from `positions` (x, y, z per joint in `SQUEEZE_JOINTS` order; a missing
 * joint is NaN). Writes into `out` and returns it; never allocates.
 */
export function computeHandCurlInto(
  positions: ArrayLike<number>,
  out: HandCurlResult,
  config: SqueezeConfig = APP_CONFIG.squeeze,
): HandCurlResult {
  out.curl = Number.NaN;
  out.validFingers = 0;
  const palm = jointDistance(positions, WRIST, MIDDLE_KNUCKLE);
  out.palmLengthMeters = palm;
  if (
    !Number.isFinite(palm) ||
    palm < config.minPalmLengthMeters ||
    palm > config.maxPalmLengthMeters
  ) {
    return out;
  }
  let sum = 0;
  let valid = 0;
  for (let f = 0; f < FINGER_COUNT; f += 1) {
    const knuckle = 1 + f * 2;
    const d = jointDistance(positions, knuckle, knuckle + 1);
    if (Number.isFinite(d)) {
      sum += d / palm;
      valid += 1;
    }
  }
  out.validFingers = valid;
  if (valid >= config.minValidFingers) {
    out.curl = sum / valid;
  }
  return out;
}

/** Linear map of curl between calibrated open (squeeze 0) and fist (squeeze 1), clamped. */
export function squeezeFromCurl(curl: number, openCurl: number, fistCurl: number): number {
  const span = openCurl - fistCurl;
  if (!Number.isFinite(curl) || !(span > 0)) {
    return Number.NaN;
  }
  const s = (openCurl - curl) / span;
  return s <= 0 ? 0 : s >= 1 ? 1 : s;
}

export type SqueezeTracking = 'TRACKED' | 'HELD' | 'LOST';

/**
 * Smooths squeeze with the One Euro filter and handles dropouts: when the hand or its joints go
 * missing the last value is held for `missingHoldMs`, then squeeze falls back to `neutralSqueeze`
 * and tracking reads LOST. No allocation per update.
 */
export class SqueezeTracker {
  squeeze: number;
  rawSqueeze = Number.NaN;
  tracking: SqueezeTracking = 'LOST';
  private readonly config: SqueezeConfig;
  private readonly filter: OneEuroFilter3D;
  private readonly scratch = { x: 0, y: 0, z: 0 };
  private lastValidMs = -Infinity;

  constructor(config: SqueezeConfig = APP_CONFIG.squeeze) {
    this.config = config;
    this.filter = new OneEuroFilter3D(config.filter);
    this.squeeze = config.neutralSqueeze;
  }

  /** `rawSqueeze` is NaN when the hand or its joints are unavailable this frame. */
  update(rawSqueeze: number, nowMs: number): number {
    this.rawSqueeze = rawSqueeze;
    if (Number.isFinite(rawSqueeze)) {
      this.lastValidMs = nowMs;
      this.tracking = 'TRACKED';
      if (this.config.filter.enabled) {
        const ok = this.filter.filterInto(rawSqueeze, 0, 0, nowMs, this.scratch);
        this.squeeze = ok ? clamp01(this.scratch.x) : rawSqueeze;
      } else {
        this.squeeze = rawSqueeze;
      }
      return this.squeeze;
    }
    if (nowMs - this.lastValidMs <= this.config.missingHoldMs) {
      this.tracking = 'HELD';
      return this.squeeze;
    }
    if (this.tracking !== 'LOST') {
      this.filter.reset();
    }
    this.tracking = 'LOST';
    this.squeeze = this.config.neutralSqueeze;
    return this.squeeze;
  }

  reset(): void {
    this.filter.reset();
    this.lastValidMs = -Infinity;
    this.tracking = 'LOST';
    this.squeeze = this.config.neutralSqueeze;
    this.rawSqueeze = Number.NaN;
  }
}

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}
