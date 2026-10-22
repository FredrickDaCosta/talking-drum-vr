import { describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../../src/app/config.js';
import {
  computeStrikePointWorldInto,
  HandTracker,
  transformWorldPointToLocalInto,
} from '../../src/input/hand-tracker.js';
import type { MutableVec3 } from '../../src/input/one-euro-filter.js';

/**
 * Column-major inverse world matrix for a drum at (0, 1.25, -0.5) rotated +30 deg around X.
 */
function buildTiltedDrumInverseMatrixElements(
  drumCenter: MutableVec3 = { x: 0, y: 1.25, z: -0.5 },
  tiltDeg = 30,
): Float32Array {
  const rad = (tiltDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const tx = -drumCenter.x;
  const ty = -(drumCenter.y * c + drumCenter.z * s);
  const tz = drumCenter.y * s - drumCenter.z * c;

  return new Float32Array([
    1,
    0,
    0,
    0,
    0,
    c,
    -s,
    0,
    0,
    s,
    c,
    0,
    tx,
    ty,
    tz,
    1,
  ]);
}

describe('HandTracker pure helpers & adapter', () => {
  it('computes palm midpoint from wrist and middle-finger-metacarpal and supports index-finger-tip option', () => {
    const out: MutableVec3 = { x: 0, y: 0, z: 0 };
    const qualityPalm = computeStrikePointWorldInto(
      {
        wrist: { x: 0.02, y: 1.4, z: -0.38, emulatedPosition: false },
        middleFingerMetacarpal: { x: 0.06, y: 1.44, z: -0.42, emulatedPosition: false },
      },
      { strikePointMode: 'palm', allowEmulatedPoses: true },
      out,
    );

    expect(qualityPalm).toBe('TRACKED');
    expect(out.x).toBeCloseTo(0.04, 6);
    expect(out.y).toBeCloseTo(1.42, 6);
    expect(out.z).toBeCloseTo(-0.4, 6);

    const qualityTip = computeStrikePointWorldInto(
      {
        indexFingerTip: { x: -0.01, y: 1.45, z: -0.41, emulatedPosition: false },
      },
      { strikePointMode: 'index-finger-tip', allowEmulatedPoses: true },
      out,
    );

    expect(qualityTip).toBe('TRACKED');
    expect(out.x).toBeCloseTo(-0.01, 6);
    expect(out.y).toBeCloseTo(1.45, 6);
    expect(out.z).toBeCloseTo(-0.41, 6);
  });

  it('gates missing or NaN joint poses and surfaces emulatedPosition as TRACKED or EMULATED', () => {
    const out: MutableVec3 = { x: 0, y: 0, z: 0 };

    expect(
      computeStrikePointWorldInto(
        { wrist: { x: 0, y: 1.4, z: -0.4 }, middleFingerMetacarpal: null },
        { strikePointMode: 'palm', allowEmulatedPoses: true },
        out,
      ),
    ).toBe('UNTRACKED');

    expect(
      computeStrikePointWorldInto(
        {
          wrist: { x: Number.NaN, y: 1.4, z: -0.4 },
          middleFingerMetacarpal: { x: 0, y: 1.4, z: -0.4 },
        },
        { strikePointMode: 'palm', allowEmulatedPoses: true },
        out,
      ),
    ).toBe('UNTRACKED');

    expect(
      computeStrikePointWorldInto(
        {
          wrist: { x: 0, y: 1.4, z: -0.4, emulatedPosition: true },
          middleFingerMetacarpal: { x: 0, y: 1.4, z: -0.4, emulatedPosition: false },
        },
        { strikePointMode: 'palm', allowEmulatedPoses: true },
        out,
      ),
    ).toBe('EMULATED');

    expect(
      computeStrikePointWorldInto(
        {
          wrist: { x: 0, y: 1.4, z: -0.4, emulatedPosition: true },
          middleFingerMetacarpal: { x: 0, y: 1.4, z: -0.4, emulatedPosition: false },
        },
        { strikePointMode: 'palm', allowEmulatedPoses: false },
        out,
      ),
    ).toBe('UNTRACKED');
  });

  it('converts tilted world coordinates into drum-local coordinates without allocation', () => {
    const invElements = buildTiltedDrumInverseMatrixElements();
    const outLocal: MutableVec3 = { x: 0, y: 0, z: 0 };

    // Top head centre in world space: (0, 1.25 + 0.19*cos30, -0.5 + 0.19*sin30)
    const topHeadWorld: MutableVec3 = {
      x: 0,
      y: 1.25 + 0.19 * Math.cos((30 * Math.PI) / 180),
      z: -0.5 + 0.19 * Math.sin((30 * Math.PI) / 180),
    };

    const ok = transformWorldPointToLocalInto(topHeadWorld, invElements, outLocal);
    expect(ok).toBe(true);
    expect(outLocal.x).toBeCloseTo(0, 6);
    expect(outLocal.y).toBeCloseTo(0.19, 6);
    expect(outLocal.z).toBeCloseTo(0, 6);
  });

  it('separates strikeFilter and visualFilter outputs and resets after dropouts over maxGapMs', () => {
    const tracker = new HandTracker(APP_CONFIG);
    const invElements = buildTiltedDrumInverseMatrixElements();
    const c = Math.cos((30 * Math.PI) / 180);
    const s = Math.sin((30 * Math.PI) / 180);
    const halfLength = APP_CONFIG.drumGeometry.lengthMeters / 2;

    const worldFromLocalY = (localY: number): MutableVec3 => ({
      x: 0,
      y: 1.25 + localY * c,
      z: -0.5 + localY * s,
    });

    const p0 = worldFromLocalY(0.25);
    const s0 = tracker.sampleHandFromJoints(
      'right',
      { wrist: p0, middleFingerMetacarpal: p0 },
      invElements,
      0,
    );
    expect(s0.quality).toBe('TRACKED');
    expect(s0.strikeLocal.y).toBeCloseTo(0.25, 5);
    expect(s0.visualLocal.y).toBeCloseTo(0.25, 5);
    expect(s0.skinDistanceMeters).toBeCloseTo(0.06, 5);

    // Step rapidly to localY = 0.18 at t = 14 ms: strikeFilter (higher cutoff/beta) tracks closer than visualFilter
    const p1 = worldFromLocalY(0.18);
    const s1 = tracker.sampleHandFromJoints(
      'right',
      { wrist: p1, middleFingerMetacarpal: p1 },
      invElements,
      14,
    );
    expect(s1.strikeLocal.y).toBeLessThan(s1.visualLocal.y);
    expect(s1.skinDistanceMeters).toBeCloseTo(s1.visualLocal.y - halfLength, 6);

    // Dropout over maxGapMs (100 ms): at t = 200 ms, filters must reset and snap directly to the new sample
    const pAfterDropout = worldFromLocalY(0.23);
    const sAfterDropout = tracker.sampleHandFromJoints(
      'right',
      { wrist: pAfterDropout, middleFingerMetacarpal: pAfterDropout },
      invElements,
      200,
    );
    expect(sAfterDropout.strikeLocal.y).toBeCloseTo(0.23, 6);
    expect(sAfterDropout.visualLocal.y).toBeCloseTo(0.23, 6);

    // Also verify index-finger-tip config option on HandTracker
    const tipConfig: AppConfig = {
      ...APP_CONFIG,
      strike: { ...APP_CONFIG.strike, strikePointMode: 'index-finger-tip' },
    };
    const tipTracker = new HandTracker(tipConfig);
    const sTip = tipTracker.sampleHandFromJoints(
      'right',
      { indexFingerTip: p0 },
      invElements,
      0,
    );
    expect(sTip.quality).toBe('TRACKED');
    expect(sTip.strikeLocal.y).toBeCloseTo(0.25, 5);
  });
});
