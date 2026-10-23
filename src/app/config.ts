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
  /** Minimum height above the skin plane the hand must reach within approachWindowMs before a downward crossing counts (meters). */
  readonly minApproachTravelMeters: number;
  /** Lookback time window for verifying minApproachTravelMeters above the skin plane (milliseconds). */
  readonly approachWindowMs: number;
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

export interface DrumAudioConfig {
  /** Strike speed mapped to the quietest voice; slower hits are clamped up to it (meters per second). */
  readonly minStrikeSpeedMps: number;
  /** Strike speed mapped to full gain; faster hits are clamped down to it (meters per second). */
  readonly maxStrikeSpeedMps: number;
  /** Gain at the quietest normalised velocity (v = 0); g = minGain + (1 - minGain) * v^gainExponent. */
  readonly minGain: number;
  /** Perceptual exponent applied to the normalised velocity. */
  readonly gainExponent: number;
  /** Lower clamp for play({ pitchRatio }) -> AudioBufferSourceNode.playbackRate. */
  readonly minPitchRatio: number;
  /** Upper clamp for play({ pitchRatio }) -> AudioBufferSourceNode.playbackRate. */
  readonly maxPitchRatio: number;
  /** Pre-allocated per-voice GainNodes reused round-robin (no per-hit GainNode allocation). */
  readonly voicePoolSize: number;
  /** Sample rate of the OfflineAudioContext that renders the placeholder gángan buffer (Hz). */
  readonly placeholderSampleRateHz: number;
  /** HRTF PannerNode reference distance (meters). */
  readonly pannerRefDistanceMeters: number;
}

export interface XrInputNoticeConfig {
  /** Time after an XR session becomes visible before checking for tracked hands (milliseconds). */
  readonly handDetectionGraceMs: number;
  /** Interval between input-source checks once the grace period has elapsed (milliseconds). */
  readonly recheckIntervalMs: number;
}

export interface SqueezeConfig {
  /**
   * Default per-finger curl for an OPEN hand, in palm lengths (mean tip-to-own-knuckle distance of
   * index..pinky divided by wrist-to-middle-knuckle distance). Used until calibration succeeds.
   */
  readonly defaultOpenCurl: number;
  /** Default curl for a tight FIST, in palm lengths. */
  readonly defaultFistCurl: number;
  /** Calibration: open-minus-fist medians below this separation are rejected (palm lengths). */
  readonly minCalibrationSeparation: number;
  /** Calibration: plausible bounds for a captured median (palm lengths); outside means failed. */
  readonly minPlausibleCurl: number;
  readonly maxPlausibleCurl: number;
  /** Calibration: duration of the "open your hand" and "make a fist" steps (milliseconds). */
  readonly calibrationOpenMs: number;
  readonly calibrationFistMs: number;
  /** Calibration: samples in the first part of each step are ignored while the hand moves (milliseconds). */
  readonly calibrationSettleMs: number;
  /** Calibration: minimum valid samples per step (a robustness floor for the median, not a frame-rate proxy: ~10 fps headless gives ~15, a 72 Hz headset ~108). */
  readonly minCalibrationSamples: number;
  /** How long the result message ("calibrated" / "using defaults") stays on screen (milliseconds). */
  readonly calibrationResultMessageMs: number;
  /** Plausible palm length (wrist to middle knuckle) in meters; outside this the frame is rejected. */
  readonly minPalmLengthMeters: number;
  readonly maxPalmLengthMeters: number;
  /** Minimum number of fingers (of index, middle, ring, pinky) with valid joints for a usable frame. */
  readonly minValidFingers: number;
  /** Hold the last squeeze this long when joints go missing, then fall back to neutral (milliseconds). */
  readonly missingHoldMs: number;
  /** Squeeze used when the squeeze hand is lost (0..1; 0.5 = mid pitch). */
  readonly neutralSqueeze: number;
  /** One Euro filter for the 0..1 squeeze value (units: squeeze per second). */
  readonly filter: OneEuroFilterConfig;
}

export type PitchBand = 'L' | 'M' | 'H';

export interface PitchConfig {
  /** playbackRate at squeeze 0 (open hand). */
  readonly lowRatio: number;
  /** playbackRate at squeeze 0.5. */
  readonly midRatio: number;
  /** playbackRate at squeeze 1 (fist). */
  readonly highRatio: number;
  /** Squeeze below this is band L (before hysteresis). */
  readonly lowBandMax: number;
  /** Squeeze above this is band H (before hysteresis). */
  readonly highBandMin: number;
  /**
   * Total hysteresis width around each band threshold: moving up needs threshold + h/2,
   * moving down needs threshold - h/2.
   */
  readonly bandHysteresis: number;
}

export interface PitchLadderConfig {
  /** Ladder base offset from the drum origin in world axes (meters); left of the drum for a left-hand squeeze. */
  readonly offsetMeters: readonly [number, number, number];
  /** Height of the ladder track (meters); squeeze 0 at the bottom, 1 at the top. */
  readonly heightMeters: number;
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
  readonly audio: DrumAudioConfig;
  readonly xrInputNotice: XrInputNoticeConfig;
  readonly squeeze: SqueezeConfig;
  readonly pitch: PitchConfig;
  readonly pitchLadder: PitchLadderConfig;
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
    minApproachTravelMeters: 0.02,
    approachWindowMs: 150,
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
  audio: {
    minStrikeSpeedMps: 0.3,
    maxStrikeSpeedMps: 3.0,
    minGain: 0.15,
    gainExponent: 0.75,
    minPitchRatio: 0.5,
    maxPitchRatio: 2.0,
    voicePoolSize: 8,
    placeholderSampleRateHz: 48000,
    pannerRefDistanceMeters: 0.5,
  },
  xrInputNotice: {
    handDetectionGraceMs: 3000,
    recheckIntervalMs: 250,
  },
  squeeze: {
    defaultOpenCurl: 0.95,
    defaultFistCurl: 0.35,
    minCalibrationSeparation: 0.2,
    minPlausibleCurl: 0.05,
    maxPlausibleCurl: 1.6,
    calibrationOpenMs: 2000,
    calibrationFistMs: 2000,
    calibrationSettleMs: 500,
    minCalibrationSamples: 8,
    calibrationResultMessageMs: 2500,
    minPalmLengthMeters: 0.05,
    maxPalmLengthMeters: 0.16,
    minValidFingers: 2,
    missingHoldMs: 250,
    neutralSqueeze: 0.5,
    filter: {
      enabled: true,
      minCutoffHz: 2.0,
      beta: 0.6,
      dCutoffHz: 1.0,
      maxGapMs: 150,
    },
  },
  pitch: {
    lowRatio: 0.75,
    midRatio: 1.0,
    highRatio: 1.33,
    lowBandMax: 0.33,
    highBandMin: 0.67,
    bandHysteresis: 0.04,
  },
  pitchLadder: {
    offsetMeters: [-0.2, 0.05, 0.08],
    heightMeters: 0.18,
  },
  diagnostics: {
    fpsUpdateIntervalMs: 250,
  },
};
