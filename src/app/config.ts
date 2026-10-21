/**
 * Central configuration for Talking Drum VR (see ADR-005).
 * All spatial, visual, and gameplay tunables live here rather than inline magic numbers.
 */

export interface DrumPlacementConfig {
  /** Default eye height in meters when no XR pose is active (matches IWER standing/seated reference). */
  readonly defaultEyeLevelMeters: number;
  /** Distance in front of the player's head along -Z (meters). */
  readonly distanceAheadMeters: number;
  /** Vertical offset below the player's eye level (meters). */
  readonly belowEyeLevelMeters: number;
}

export interface DrumGeometryConfig {
  /** Total length of the hourglass drum shell (meters). */
  readonly lengthMeters: number;
  /** Radius of the left and right struck drumheads (meters). */
  readonly headRadiusMeters: number;
  /** Radius of the narrow waist at the center of the hourglass shell (meters). */
  readonly waistRadiusMeters: number;
  /** Number of tension cords bridging the two drumheads. */
  readonly tensionCordCount: number;
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
  readonly diagnostics: DiagnosticsConfig;
  // Phase 1+ tunables (commented placeholders for M1 strike detection & audio):
  // readonly strikeMinVelocityMetersPerSec: number; // e.g. 0.35
  // readonly strikeCooldownMs: number;              // e.g. 45
  // readonly squeezePitchRangeSemitones: number;    // e.g. 7 (low to high Yoruba tone)
}

export const APP_CONFIG: AppConfig = {
  appTitle: 'Talking Drum VR',
  defaultBasePath: '/talking-drum-vr/',
  drumPlacement: {
    defaultEyeLevelMeters: 1.6,
    distanceAheadMeters: 0.5,
    belowEyeLevelMeters: 0.35,
  },
  drumGeometry: {
    lengthMeters: 0.38,
    headRadiusMeters: 0.11,
    waistRadiusMeters: 0.055,
    tensionCordCount: 12,
  },
  diagnostics: {
    fpsUpdateIntervalMs: 250,
  },
};
