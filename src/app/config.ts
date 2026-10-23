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
  /**
   * Gain of the non-spatial "correct" / "try again" cues. Kept below minGain so a cue is quieter
   * than even the softest drum hit (checked against the rendered peaks in the e2e suite).
   */
  readonly cueGain: number;
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
  /** Calibration runs (first try plus retries) before falling back to the defaults. */
  readonly calibrationMaxAttempts: number;
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

export interface LessonConfig {
  /** Demo playback ratio for each tone band (the drum "speaks" these pitches). */
  readonly bandRatios: Readonly<Record<PitchBand, number>>;
  /** Demo strike speed passed as `velocity` (m/s) to DrumAudio. */
  readonly demoVelocityMps: number;
  /** Time between demo syllables, on the audio clock (milliseconds). */
  readonly syllableIntervalMs: number;
  /** Delay from scheduling a demo to its first syllable (milliseconds). */
  readonly demoLeadInMs: number;
  /** Pause after the demo's last syllable before "Your turn" (milliseconds). */
  readonly postDemoPauseMs: number;
  /** An attempt ends this long after the last strike if it is still incomplete (milliseconds). */
  readonly attemptGapMs: number;
  /** With no strike this long after the cue, the demo replays without costing a try (milliseconds). */
  readonly idleReplayMs: number;
  /** Tries per phrase before the answer is shown (the retry cap). */
  readonly maxTries: number;
  /** How long "Well done" / "Try again" stays up (milliseconds). */
  readonly feedbackMs: number;
  /** How long the level title stays up before the first demo (milliseconds). */
  readonly levelIntroMs: number;
  /** How long the level result stays up (milliseconds). */
  readonly levelCompleteMs: number;
  /**
   * Soft session cap from the title strike (ms; Infinity disables). Once passed, the phrase in
   * progress finishes normally (retries and answer included), then the session goes to END.
   */
  readonly sessionCapMs: number;
  /** Phrases played per level (taken in data-file order); 'all' = every entry of that level. */
  readonly phrasesPerLevel: Readonly<Record<1 | 2 | 3, number | 'all'>>;
  /** content:validate fails if a level has fewer entries than this. */
  readonly minEntriesPerLevel: Readonly<Record<1 | 2 | 3, number>>;
}

export interface LessonPanelConfig {
  /** Panel centre offset from the drum origin in world axes (meters): above and just behind the drum. */
  readonly offsetMeters: readonly [number, number, number];
  readonly widthMeters: number;
  readonly heightMeters: number;
  /** Canvas texture size in pixels (same aspect as the panel). */
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  /**
   * Text sizes in canvas pixels (1 px = heightMeters / canvasHeightPx = 0.3125 mm on the panel).
   * At ~0.55 m, 40 px (12.5 mm) subtends ~1.3 degrees.
   */
  readonly textPx: {
    readonly header: number;
    readonly word: number;
    readonly syllable: number;
    readonly gloss: number;
    readonly status: number;
    readonly bigStatus: number;
    readonly detail: number;
    readonly instruction: number;
  };
}

export interface DebugPanelConfig {
  /** Shown at start (only ever built with ?debug=1). Toggled in VR by a left-index touch. */
  readonly visibleAtStart: boolean;
  /** Panel centre offset from the drum origin in world axes (meters): low and right of the drum. */
  readonly offsetMeters: readonly [number, number, number];
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  /** Text size in canvas px (1 px = heightMeters / canvasHeightPx). */
  readonly textPx: number;
  /** Panel text refresh rate (Hz); values are sampled into preallocated fields between refreshes. */
  readonly refreshHz: number;
  /** A fingertip within this distance of the panel plane (and inside its outline) is a touch (m). */
  readonly touchDepthMeters: number;
  /** After a touch, the same hand must leave the panel and wait this long before it touches again (ms). */
  readonly touchRearmMs: number;
  /** Marks kept in the ring buffer (oldest overwritten). */
  readonly markCapacity: number;
  /** Debug keyboard shortcuts (KeyboardEvent.code). */
  readonly toggleKey: string;
  readonly markKey: string;
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
  readonly lesson: LessonConfig;
  readonly lessonPanel: LessonPanelConfig;
  readonly debugPanel: DebugPanelConfig;
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
    cueGain: 0.12,
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
    calibrationMaxAttempts: 2,
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
  lesson: {
    bandRatios: { L: 0.75, M: 1.0, H: 1.33 },
    demoVelocityMps: 1.5,
    syllableIntervalMs: 600,
    demoLeadInMs: 150,
    postDemoPauseMs: 700,
    attemptGapMs: 4000,
    idleReplayMs: 10000,
    maxTries: 3,
    feedbackMs: 2500,
    levelIntroMs: 3500,
    levelCompleteMs: 4000,
    sessionCapMs: 510_000, // 8.5 min
    // 'all' plays every entry of that level in data-file order, so new entries need no code change.
    phrasesPerLevel: { 1: 'all', 2: 'all', 3: 'all' },
    minEntriesPerLevel: { 1: 8, 2: 12, 3: 4 },
  },
  lessonPanel: {
    offsetMeters: [0, 0.3, -0.05],
    widthMeters: 0.32,
    heightMeters: 0.16,
    canvasWidthPx: 1024,
    canvasHeightPx: 512,
    textPx: {
      header: 30,
      word: 96,
      syllable: 40,
      gloss: 34,
      status: 50,
      bigStatus: 64,
      detail: 30,
      instruction: 40,
    },
  },
  debugPanel: {
    visibleAtStart: true,
    offsetMeters: [0.3, 0.04, 0.16],
    widthMeters: 0.24,
    heightMeters: 0.18,
    canvasWidthPx: 1024,
    canvasHeightPx: 768,
    textPx: 38,
    refreshHz: 4,
    touchDepthMeters: 0.03,
    touchRearmMs: 600,
    markCapacity: 32,
    toggleKey: 'Backquote',
    markKey: 'KeyM',
  },
  diagnostics: {
    fpsUpdateIntervalMs: 250,
  },
};
