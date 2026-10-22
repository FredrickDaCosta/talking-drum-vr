import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../src/app/config.js';
import { parseAppFlags } from '../../src/app/flags.js';

describe('parseAppFlags', () => {
  it('defaults flags on empty query string', () => {
    expect(parseAppFlags('')).toEqual({ xrfps: false, debug: false });
    expect(parseAppFlags('?')).toEqual({ xrfps: false, debug: false });
  });

  it('enables xrfps when ?xrfps=1 or ?xrfps=true', () => {
    expect(parseAppFlags('?xrfps=1')).toEqual({ xrfps: true, debug: false });
    expect(parseAppFlags('xrfps=true')).toEqual({ xrfps: true, debug: false });
  });

  it('enables debug when ?debug=1 or ?debug=true', () => {
    expect(parseAppFlags('?debug=1')).toEqual({ xrfps: false, debug: true });
    expect(parseAppFlags('?debug=TRUE')).toEqual({ xrfps: false, debug: true });
  });

  it('enables both flags when ?xrfps=1&debug=1 is passed', () => {
    expect(parseAppFlags('?xrfps=1&debug=1')).toEqual({
      xrfps: true,
      debug: true,
    });
  });

  it('keeps flags disabled for non-truthy values', () => {
    expect(parseAppFlags('?xrfps=0&debug=false')).toEqual({
      xrfps: false,
      debug: false,
    });
  });

  it('parses ?hand=left and ?hand=right case-insensitively and ignores invalid values', () => {
    expect(parseAppFlags('?hand=left')).toEqual({ xrfps: false, debug: false, hand: 'left' });
    expect(parseAppFlags('?hand=RIGHT&debug=1')).toEqual({
      xrfps: false,
      debug: true,
      hand: 'right',
    });
    expect(parseAppFlags('?hand=invalid')).toEqual({ xrfps: false, debug: false });
  });
});

describe('APP_CONFIG', () => {
  it('defines seated drum placement 0.5m ahead, 0.35m below eye level, and 30 deg tilt', () => {
    expect(APP_CONFIG.drumPlacement.distanceAheadMeters).toBe(0.5);
    expect(APP_CONFIG.drumPlacement.belowEyeLevelMeters).toBe(0.35);
    expect(APP_CONFIG.drumPlacement.drumTiltDeg).toBe(30);
    expect(APP_CONFIG.defaultBasePath).toBe('/');
  });
});
