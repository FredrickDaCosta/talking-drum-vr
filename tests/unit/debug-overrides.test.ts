import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../../src/app/config.js';
import { applyDebugOverrides, DEBUG_OVERRIDE_SPECS } from '../../src/app/debug-overrides.js';

function freshConfig(): typeof APP_CONFIG {
  return JSON.parse(JSON.stringify(APP_CONFIG));
}

describe('applyDebugOverrides', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when debug is false, even with valid override params in the URL', () => {
    const config = freshConfig();
    const before = JSON.stringify(config);
    const applied = applyDebugOverrides('?strikeMinSpeed=0.5', false, config);
    expect(applied).toEqual([]);
    expect(JSON.stringify(config)).toBe(before);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('applies every known param inside its valid range', () => {
    const config = freshConfig();
    const search = DEBUG_OVERRIDE_SPECS.map((s) => `${s.param}=${(s.min + s.max) / 2}`).join('&');
    const applied = applyDebugOverrides(`?${search}`, true, config);
    expect(applied).toHaveLength(DEBUG_OVERRIDE_SPECS.length);
    for (const spec of DEBUG_OVERRIDE_SPECS) {
      expect(spec.read(config)).toBeCloseTo((spec.min + spec.max) / 2, 9);
    }
  });

  it('ignores a value above max, below min, or unparsable, with a console.warn and no mutation', () => {
    const config = freshConfig();
    const before = JSON.stringify(config);
    const applied = applyDebugOverrides(
      '?strikeMinSpeed=99&strikeDebounceMs=-5&approachTravelM=notanumber',
      true,
      config,
    );
    expect(applied).toEqual([]);
    expect(JSON.stringify(config)).toBe(before);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it('ignores an unrecognised param silently (no warning, no crash)', () => {
    const config = freshConfig();
    const applied = applyDebugOverrides('?notARealParam=1', true, config);
    expect(applied).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('a value exactly at min or max is accepted (inclusive bounds)', () => {
    const spec = DEBUG_OVERRIDE_SPECS[0];
    const appliedMin = applyDebugOverrides(`?${spec.param}=${spec.min}`, true, freshConfig());
    const appliedMax = applyDebugOverrides(`?${spec.param}=${spec.max}`, true, freshConfig());
    expect(appliedMin).toEqual([{ param: spec.param, value: spec.min }]);
    expect(appliedMax).toEqual([{ param: spec.param, value: spec.max }]);
  });

  it('mixes applied and ignored overrides in one query string', () => {
    const config = freshConfig();
    const applied = applyDebugOverrides('?strikeMinSpeed=0.5&strikeDebounceMs=9999', true, config);
    expect(applied).toEqual([{ param: 'strikeMinSpeed', value: 0.5 }]);
    expect(config.strike.minDownwardSpeedMetersPerSec).toBe(0.5);
    expect(config.strike.debounceMs).toBe(APP_CONFIG.strike.debounceMs);
  });
});
