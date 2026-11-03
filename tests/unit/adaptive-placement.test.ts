import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../src/app/config.js';
import {
  clampEyeHeightMeters,
  computeAdaptiveDrumPose,
  forwardFromQuaternion,
  quatFromAxisAngle,
  rotateVectorByQuaternion,
  yawFromQuaternion,
} from '../../src/game/adaptive-placement.js';
import { computeTiltedTopHeadReachFromEye } from '../../src/input/hand-tracker.js';

const FIXED_REACH = computeTiltedTopHeadReachFromEye(APP_CONFIG).euclideanDistanceMeters;

describe('yawFromQuaternion / forwardFromQuaternion', () => {
  it('an identity quaternion faces -Z (yaw 0)', () => {
    const f = forwardFromQuaternion({ x: 0, y: 0, z: 0, w: 1 });
    expect(f.x).toBeCloseTo(0, 6);
    expect(f.y).toBeCloseTo(0, 6);
    expect(f.z).toBeCloseTo(-1, 6);
    expect(yawFromQuaternion({ x: 0, y: 0, z: 0, w: 1 })).toBeCloseTo(0, 6);
  });

  it.each([0, 30, 90, 135, 180, -45, -120, 200])(
    'round-trips a %d deg yaw-only quaternion through yawFromQuaternion -> quatFromAxisAngle',
    (deg) => {
      const rad = (deg * Math.PI) / 180;
      const q = quatFromAxisAngle(0, 1, 0, rad);
      const yaw = yawFromQuaternion(q);
      const rebuilt = quatFromAxisAngle(0, 1, 0, yaw);
      const original = forwardFromQuaternion(q);
      const reconstructed = forwardFromQuaternion(rebuilt);
      expect(reconstructed.x).toBeCloseTo(original.x, 6);
      expect(reconstructed.z).toBeCloseTo(original.z, 6);
    },
  );
});

describe('clampEyeHeightMeters', () => {
  it('passes values inside the seated-to-standing range through unchanged', () => {
    expect(clampEyeHeightMeters(1.0, APP_CONFIG)).toBe(1.0);
    expect(clampEyeHeightMeters(1.6, APP_CONFIG)).toBe(1.6);
    expect(clampEyeHeightMeters(1.8, APP_CONFIG)).toBe(1.8);
  });

  it('clamps outside the range, and non-finite values fall back to the default eye level', () => {
    expect(clampEyeHeightMeters(0.4, APP_CONFIG)).toBe(
      APP_CONFIG.adaptivePlacement.minEyeHeightMeters,
    );
    expect(clampEyeHeightMeters(2.3, APP_CONFIG)).toBe(
      APP_CONFIG.adaptivePlacement.maxEyeHeightMeters,
    );
    expect(clampEyeHeightMeters(Number.NaN, APP_CONFIG)).toBe(
      APP_CONFIG.drumPlacement.defaultEyeLevelMeters,
    );
  });
});

describe('computeAdaptiveDrumPose: the 0.61 m reach rule holds for every head height and yaw', () => {
  const heights = [1.0, 1.1, 1.3, 1.6, 1.8];
  const yawsDeg = [0, 30, 90, 150, 180, -60, -179];
  const positionsXZ: Array<[number, number]> = [
    [0, 0],
    [0.4, -0.3],
    [-0.9, 1.2],
  ];

  for (const eyeHeight of heights) {
    for (const yawDeg of yawsDeg) {
      for (const [x, z] of positionsXZ) {
        it(`eye ${eyeHeight} m, yaw ${yawDeg} deg, head at (${x}, ${z})`, () => {
          const headWorld = { x, y: eyeHeight, z };
          const yawRad = (yawDeg * Math.PI) / 180;
          const { position, quaternion } = computeAdaptiveDrumPose(headWorld, yawRad, APP_CONFIG);

          const halfLength = APP_CONFIG.drumGeometry.lengthMeters / 2;
          const topHeadOffset = rotateVectorByQuaternion({ x: 0, y: 1, z: 0 }, quaternion);
          const topHeadCenter = {
            x: position.x + halfLength * topHeadOffset.x,
            y: position.y + halfLength * topHeadOffset.y,
            z: position.z + halfLength * topHeadOffset.z,
          };

          const dx = topHeadCenter.x - headWorld.x;
          const dy = topHeadCenter.y - headWorld.y;
          const dz = topHeadCenter.z - headWorld.z;
          const reach = Math.hypot(dx, dy, dz);

          expect(reach).toBeCloseTo(FIXED_REACH, 6);
          expect(reach).toBeLessThanOrEqual(0.61);
        });
      }
    }
  }
});

describe('computeAdaptiveDrumPose: matches the fixed placement at yaw 0, default eye height', () => {
  it('reproduces the scene-authored [0, 1.25, -0.5] drum position (yaw 0, eye at 1.6 m)', () => {
    const { position, quaternion } = computeAdaptiveDrumPose(
      { x: 0, y: APP_CONFIG.drumPlacement.defaultEyeLevelMeters, z: 0 },
      0,
      APP_CONFIG,
    );
    expect(position.x).toBeCloseTo(0, 6);
    expect(position.y).toBeCloseTo(1.25, 6);
    expect(position.z).toBeCloseTo(-0.5, 6);
    // Pure X-axis tilt (yaw 0): y and z components are 0, matching rotationDeg [30, 0, 0] with no
    // baked yaw.
    expect(quaternion.y).toBeCloseTo(0, 6);
    expect(quaternion.z).toBeCloseTo(0, 6);
    expect(quaternion.x).toBeCloseTo(
      Math.sin((APP_CONFIG.drumPlacement.drumTiltDeg * Math.PI) / 360),
      6,
    );
  });

  it('clamping a head height already inside range is a no-op, so the reach stays the fixed value', () => {
    for (const eyeHeight of [1.0, 1.4, 1.8]) {
      const { position, quaternion } = computeAdaptiveDrumPose(
        { x: 0, y: eyeHeight, z: 0 },
        0,
        APP_CONFIG,
      );
      const halfLength = APP_CONFIG.drumGeometry.lengthMeters / 2;
      const topHeadOffset = rotateVectorByQuaternion({ x: 0, y: 1, z: 0 }, quaternion);
      const dy = position.y + halfLength * topHeadOffset.y - eyeHeight;
      const dx = position.x + halfLength * topHeadOffset.x;
      const dz = position.z + halfLength * topHeadOffset.z;
      expect(Math.hypot(dx, dy, dz)).toBeCloseTo(FIXED_REACH, 6);
    }
  });
});
