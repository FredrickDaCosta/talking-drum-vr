/**
 * Central configuration for Talking Drum VR (see ADR-005).
 * All spatial, visual, and gameplay tunables live here rather than inline magic numbers.
 */

export type Handedness = 'left' | 'right';
export type StrikePointMode = 'palm' | 'index-finger-tip';

export interface DrumPlacementConfig {
  /** Default eye height in meters when no XR pose is active (matches IWER standing/seated reference). */
  readonly defaultEyeLevelMeters: number;
  /** Distance in front of the player's head along -Z (meters). Must remain <= 0.61 m (2 ft reach rule). */
  readonly distanceAheadMeters: number;
  /** Vertical offset below the player's eye level (meters). */
  readonly belowEyeLevelMeters: number;
  /** Tilt of the top struck drumhead toward the seated player around +X (degrees). */
  readonly drumTiltDeg: number;
}

export interface DrumGeometryConfig {
  /** Total length of the hourglass drum shell (meters). */
  readonly lengthMeters: number;
  /** Radius of the struck drumheads (meters). */
  readonly headRadiusMeters: number;
  /** Radius of the narrow waist at the center of the hourglass shell (meters). */
  readonly waistRadiusMeters: number;
  /** Number of tension cords bridging the two drumheads. */
  readonly tensionCordCount: number;
}

export interface StrikeConfig {
  /** Minimum downward velocity normal to the drumhead skin plane required to trigger a hit (meters per second). */
  readonly minDownwardSpeedMetersPerSec: number;
  /** Minimum elapsed time between two hits from the same hand (milliseconds). */
  readonly debounceMs: number;
  /** Radial margin added to headRadiusMeters for forgiving palm/fingertip edge strikes (meters). */
  readonly hitRadiusMarginMeters: number;
  /** Height above the top drumhead skin plane the hand must return to before re-arming (meters). */
  readonly rearmDistanceMeters: number;
  /** Default striking hand ('right' | 'left'). */
  readonly primaryHand: Handedness;
  /** Whether the non-primary hand is allowed to trigger drumhead strikes (false: reserved for Phase 2 pitch squeeze). */
  readonly allowSecondaryHand: boolean;
  /** Anatomical reference point on the striking hand ('palm' midpoint of wrist + middle-finger-metacarpal, or 'index-finger-tip'). */
  readonly strikePointMode: StrikePointMode;
}

export interface HandTrackingConfig {
  /** Whether emulated joint poses (jointPose.emulatedPosition === true) are accepted for strike tracking. */
  readonly allowEmulatedPoses: boolean;
  /** WebXR XRHand joint name for the wrist. */
  readonly wristJointName: 'wrist';
  /** WebXR XRHand joint name paired with wrist to compute the palm midpoint. */
  readonly palmMetacarpalJointName: 'middle-finger-metacarpal';
  /** WebXR XRHand joint name used when strikePointMode === 'index-finger-tip'. */
  readonly indexTipJointName: 'index-finger-tip';
}

export interface OneEuroFilterConfig {
  /** Whether the 3D One Euro filter is enabled (if false, raw coordinates pass through with zero lag). */
  readonly enabled: boolean;
  /** Minimum cutoff frequency at zero speed (Hz). */
  readonly minCutoffHz: number;
  /** Cutoff slope with respect to 3D speed (Hz per (m/s)). */
  readonly beta: number;
  /** Low-pass cutoff frequency for the velocity derivative (Hz). */
  readonly dCutoffHz: number;
  /** Maximum gap between consecutive samples before filter history resets (milliseconds). */
  readonly maxGapMs: number;
}

export interface DiagnosticsConfig {
  /** Refresh interval for the ?xrfps=1 FPS overlay (milliseconds). */
  readonly fpsUpdateIntervalMs: number;
}

export interface AppConfig {
  readonly appTitle: string;
  readonly defaultBasePath: string;
  readonly drumPlacement: DrumPlacementConfig;
  readonly drumGeometry: DrumGeometryConfig;
  readonly strike: StrikeConfig;
  readonly handTracking: HandTrackingConfig;
  /** Ultra-low-lag filter feeding StrikeDetector (<= 1 frame lag at 72 Hz for speeds >= 0.5 m/s). */
  readonly strikeFilter: OneEuroFilterConfig;
  /** Heavier smoothing filter feeding visual hover indicators and HUD distance readouts only. */
  readonly visualFilter: OneEuroFilterConfig;
  readonly diagnostics: DiagnosticsConfig;
}

export const APP_CONFIG: AppConfig = {
  appTitle: 'Talking Drum VR',
  defaultBasePath: '/',
  drumPlacement: {
    defaultEyeLevelMeters: 1.6,
    distanceAheadMeters: 0.5,
    belowEyeLevelMeters: 0.35,
    drumTiltDeg: 30,
  },
  drumGeometry: {
    lengthMeters: 0.38,
    headRadiusMeters: 0.11,
    waistRadiusMeters: 0.055,
    tensionCordCount: 12,
  },
  strike: {
    minDownwardSpeedMetersPerSec: 0.3,
    debounceMs: 90,
    hitRadiusMarginMeters: 0.01,
    rearmDistanceMeters: 0.008,
    primaryHand: 'right',
    allowSecondaryHand: false,
    strikePointMode: 'palm',
  },
  handTracking: {
    allowEmulatedPoses: true,
    wristJointName: 'wrist',
    palmMetacarpalJointName: 'middle-finger-metacarpal',
    indexTipJointName: 'index-finger-tip',
  },
  strikeFilter: {
    enabled: true,
    minCutoffHz: 28.0,
    beta: 18.0,
    dCutoffHz: 35.0,
    maxGapMs: 100,
  },
  visualFilter: {
    enabled: true,
    minCutoffHz: 2.0,
    beta: 1.5,
    dCutoffHz: 5.0,
    maxGapMs: 100,
  },
  diagnostics: {
    fpsUpdateIntervalMs: 250,
  },
};
