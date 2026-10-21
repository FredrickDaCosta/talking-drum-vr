import {
  APP_CONFIG,
  type DrumGeometryConfig,
  type Handedness,
  type StrikeConfig,
} from '../app/config.js';
import type { Vec3Like } from '../input/one-euro-filter.js';

/**
 * Public strike payload emitted when a hand crosses the top drumhead skin plane.
 */
export interface DrumHit {
  /** Hit timestamp in milliseconds. */
  readonly time: number;
  /** Downward normal strike speed perpendicular to the drumhead skin plane (m/s). */
  readonly speed: number;
  /** Drum-local intersection position on the top drumhead skin plane (m). */
  readonly position: Vec3Like;
}

/**
 * Internal wrapper emitted by StrikeSystem for HUD latency and hand telemetry.
 */
export interface InternalStrikeEvent {
  readonly hit: DrumHit;
  readonly hand: Handedness;
  /** performance.now() timestamp captured at XR frame entry for software pipeline latency. */
  readonly frameTimestampMs: number;
}

/**
 * A single hand-strike sample expressed in drum-local coordinates.
 * In drum-local space, the hourglass shell axis is along Y, and the top struck drumhead
 * lies on the plane y = +lengthMeters / 2 (+0.19 m) with outward normal +Y.
 */
export interface HandStrikeSample {
  /** Sample timestamp in milliseconds. */
  readonly timeMs: number;
  /** Hand strike point in drum-local coordinates (meters). */
  readonly localPosition: Vec3Like;
  /** Handedness of the sample ('left' | 'right'). Defaults to config.strike.primaryHand when omitted. */
  readonly hand?: Handedness;
}

/**
 * Per-hand mutable state for debounce and re-arm gating.
 */
export interface StrikeDetectorHandState {
  /** Timestamp (ms) of the last emitted DrumHit for this hand, or -Infinity if none. */
  lastHitTimeMs: number;
  /** Whether the hand is currently armed to trigger a hit (must rise above rearmDistanceMeters after a hit). */
  armed: boolean;
}

export interface StrikeDetectorConfigSlice {
  readonly drumGeometry: Pick<DrumGeometryConfig, 'lengthMeters' | 'headRadiusMeters'>;
  readonly strike: StrikeConfig;
}

export function createInitialStrikeHandState(): StrikeDetectorHandState {
  return {
    lastHitTimeMs: -Infinity,
    armed: true,
  };
}

function isFiniteSample(sample: HandStrikeSample): boolean {
  return (
    Number.isFinite(sample.timeMs) &&
    Number.isFinite(sample.localPosition.x) &&
    Number.isFinite(sample.localPosition.y) &&
    Number.isFinite(sample.localPosition.z)
  );
}

/**
 * Pure swept segment-vs-skin-plane strike detector in drum-local coordinates.
 *
 * Checks whether the line segment from `prevSample.localPosition` to `currSample.localPosition`
 * crosses the top drumhead skin plane `y = +lengthMeters / 2` downward (`d_prev > 0` to `d_curr <= 0`),
 * intersects within `headRadiusMeters + hitRadiusMarginMeters`, meets `minDownwardSpeedMetersPerSec`,
 * and satisfies per-hand `debounceMs` and `rearmDistanceMeters` gates.
 */
export function detectStrike(
  prevSample: HandStrikeSample,
  currSample: HandStrikeSample,
  handState: StrikeDetectorHandState,
  config: StrikeDetectorConfigSlice = APP_CONFIG,
): DrumHit | null {
  if (!isFiniteSample(prevSample) || !isFiniteSample(currSample)) {
    return null;
  }

  const dtMs = currSample.timeMs - prevSample.timeMs;
  if (dtMs <= 0) {
    return null;
  }

  const sampleHand = currSample.hand ?? prevSample.hand ?? config.strike.primaryHand;
  if (sampleHand !== config.strike.primaryHand && !config.strike.allowSecondaryHand) {
    return null;
  }

  const skinY = config.drumGeometry.lengthMeters / 2;
  const dPrev = prevSample.localPosition.y - skinY;
  const dCurr = currSample.localPosition.y - skinY;

  // Re-arm once the hand has risen to or above rearmDistanceMeters above the skin plane
  if (!handState.armed && dPrev >= config.strike.rearmDistanceMeters) {
    handState.armed = true;
  }

  // Require a downward crossing from strictly above the skin plane (dPrev > 0) to on/below (dCurr <= 0)
  if (!(dPrev > 0 && dCurr <= 0)) {
    if (!handState.armed && dCurr >= config.strike.rearmDistanceMeters) {
      handState.armed = true;
    }
    return null;
  }

  const totalVerticalTravel = dPrev - dCurr;
  if (totalVerticalTravel <= 0) {
    return null;
  }

  // Swept segment-plane intersection parameter u in (0, 1]
  const u = dPrev / totalVerticalTravel;
  const hitX =
    prevSample.localPosition.x + u * (currSample.localPosition.x - prevSample.localPosition.x);
  const hitZ =
    prevSample.localPosition.z + u * (currSample.localPosition.z - prevSample.localPosition.z);

  // Radial distance check on the circular top drumhead
  const hitRadialDistance = Math.hypot(hitX, hitZ);
  const maxHitRadius = config.drumGeometry.headRadiusMeters + config.strike.hitRadiusMarginMeters;
  if (hitRadialDistance > maxHitRadius) {
    return null;
  }

  // Downward normal velocity check (m/s)
  const dtSec = dtMs / 1000;
  const downwardSpeedMetersPerSec = totalVerticalTravel / dtSec;
  if (downwardSpeedMetersPerSec < config.strike.minDownwardSpeedMetersPerSec) {
    return null;
  }

  // Armed & debounce check
  if (!handState.armed) {
    return null;
  }
  if (currSample.timeMs - handState.lastHitTimeMs < config.strike.debounceMs) {
    return null;
  }

  handState.lastHitTimeMs = currSample.timeMs;
  handState.armed = false;

  return {
    time: currSample.timeMs,
    speed: downwardSpeedMetersPerSec,
    position: {
      x: hitX,
      y: skinY,
      z: hitZ,
    },
  };
}
