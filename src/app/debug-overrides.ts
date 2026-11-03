import { APP_CONFIG, type AppConfig } from './config.js';

/**
 * Numeric `?debug=1`-only URL overrides of `APP_CONFIG` for Quest tuning sessions, so a value can
 * be tried without a rebuild. Each entry validates its range and writes straight into the live
 * `APP_CONFIG` object (never frozen); an out-of-range or unparsable value is ignored with a
 * `console.warn` and the config keeps its built-in default. Applied once, at startup, before any
 * system reads `APP_CONFIG`.
 */
export interface DebugOverrideSpec {
  readonly param: string;
  readonly min: number;
  readonly max: number;
  readonly apply: (config: AppConfig, value: number) => void;
  readonly read: (config: AppConfig) => number;
}

export const DEBUG_OVERRIDE_SPECS: readonly DebugOverrideSpec[] = [
  {
    param: 'strikeMinSpeed',
    min: 0.05,
    max: 2.0,
    apply: (c, v) => {
      (c.strike as { minDownwardSpeedMetersPerSec: number }).minDownwardSpeedMetersPerSec = v;
    },
    read: (c) => c.strike.minDownwardSpeedMetersPerSec,
  },
  {
    param: 'strikeDebounceMs',
    min: 20,
    max: 500,
    apply: (c, v) => {
      (c.strike as { debounceMs: number }).debounceMs = v;
    },
    read: (c) => c.strike.debounceMs,
  },
  {
    param: 'approachTravelM',
    min: 0,
    max: 0.1,
    apply: (c, v) => {
      (c.strike as { minApproachTravelMeters: number }).minApproachTravelMeters = v;
    },
    read: (c) => c.strike.minApproachTravelMeters,
  },
  {
    param: 'approachWindowMs',
    min: 50,
    max: 1000,
    apply: (c, v) => {
      (c.strike as { approachWindowMs: number }).approachWindowMs = v;
    },
    read: (c) => c.strike.approachWindowMs,
  },
  {
    param: 'hitMarginM',
    min: 0,
    max: 0.05,
    apply: (c, v) => {
      (c.strike as { hitRadiusMarginMeters: number }).hitRadiusMarginMeters = v;
    },
    read: (c) => c.strike.hitRadiusMarginMeters,
  },
  {
    param: 'syllableIntervalMs',
    min: 100,
    max: 2000,
    apply: (c, v) => {
      (c.lesson as { syllableIntervalMs: number }).syllableIntervalMs = v;
    },
    read: (c) => c.lesson.syllableIntervalMs,
  },
  {
    param: 'pitchLow',
    min: 0.3,
    max: 3,
    apply: (c, v) => {
      (c.pitch as { lowRatio: number }).lowRatio = v;
    },
    read: (c) => c.pitch.lowRatio,
  },
  {
    param: 'pitchMid',
    min: 0.3,
    max: 3,
    apply: (c, v) => {
      (c.pitch as { midRatio: number }).midRatio = v;
    },
    read: (c) => c.pitch.midRatio,
  },
  {
    param: 'pitchHigh',
    min: 0.3,
    max: 3,
    apply: (c, v) => {
      (c.pitch as { highRatio: number }).highRatio = v;
    },
    read: (c) => c.pitch.highRatio,
  },
  {
    param: 'bandLowMax',
    min: 0.05,
    max: 0.95,
    apply: (c, v) => {
      (c.pitch as { lowBandMax: number }).lowBandMax = v;
    },
    read: (c) => c.pitch.lowBandMax,
  },
  {
    param: 'bandHighMin',
    min: 0.05,
    max: 0.95,
    apply: (c, v) => {
      (c.pitch as { highBandMin: number }).highBandMin = v;
    },
    read: (c) => c.pitch.highBandMin,
  },
  {
    param: 'calibSeparation',
    min: 0.02,
    max: 0.8,
    apply: (c, v) => {
      (c.squeeze as { minCalibrationSeparation: number }).minCalibrationSeparation = v;
    },
    read: (c) => c.squeeze.minCalibrationSeparation,
  },
  {
    param: 'placeDistanceM',
    min: 0.1,
    max: 0.61,
    apply: (c, v) => {
      (c.drumPlacement as { distanceAheadMeters: number }).distanceAheadMeters = v;
    },
    read: (c) => c.drumPlacement.distanceAheadMeters,
  },
  {
    param: 'placeHeightOffsetM',
    min: 0,
    max: 1.0,
    apply: (c, v) => {
      (c.drumPlacement as { belowEyeLevelMeters: number }).belowEyeLevelMeters = v;
    },
    read: (c) => c.drumPlacement.belowEyeLevelMeters,
  },
];

export interface AppliedOverride {
  readonly param: string;
  readonly value: number;
}

/**
 * Parses and applies every recognised `DEBUG_OVERRIDE_SPECS` param present in `search` onto
 * `config`, in place. Silently does nothing (returns `[]`) unless `debugEnabled` is true. Returns
 * the overrides actually applied (for the debug panel / Copy Report); an out-of-range or
 * unparsable value is skipped with a `console.warn` and never appears in the returned list.
 */
export function applyDebugOverrides(
  search: string,
  debugEnabled: boolean,
  config: AppConfig = APP_CONFIG,
): AppliedOverride[] {
  if (!debugEnabled) {
    return [];
  }
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const applied: AppliedOverride[] = [];
  for (const spec of DEBUG_OVERRIDE_SPECS) {
    const raw = params.get(spec.param);
    if (raw === null) {
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
      console.warn(
        `[debug-overrides] ignoring ?${spec.param}=${raw}: expected a finite number in [${spec.min}, ${spec.max}]`,
      );
      continue;
    }
    spec.apply(config, value);
    applied.push({ param: spec.param, value });
  }
  return applied;
}

declare global {
  interface Window {
    __talkingDrumOverrides?: readonly AppliedOverride[];
  }
}
