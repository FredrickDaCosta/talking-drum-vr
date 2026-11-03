import { APP_CONFIG, type AppConfig } from '../app/config.js';
import type { MutableVec3, Vec3Like } from '../input/one-euro-filter.js';

/** Plain quaternion (x, y, z, w); kept dependency-free like the hand-tracker pure-maths helpers. */
export interface MutableQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function quatFromAxisAngle(
  axisX: number,
  axisY: number,
  axisZ: number,
  rad: number,
): MutableQuat {
  const half = rad / 2;
  const s = Math.sin(half);
  return { x: axisX * s, y: axisY * s, z: axisZ * s, w: Math.cos(half) };
}

/** Hamilton product `a * b` (apply `b` first, then `a`, matching Three.js's `Quaternion.multiply`). */
export function quatMultiply(a: MutableQuat, b: MutableQuat): MutableQuat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Rotates `v` by unit quaternion `q` (standard `v + 2*cross(q.xyz, cross(q.xyz, v) + q.w*v)`). */
export function rotateVectorByQuaternion(v: Vec3Like, q: MutableQuat): MutableVec3 {
  const cx = q.y * v.z - q.z * v.y + q.w * v.x;
  const cy = q.z * v.x - q.x * v.z + q.w * v.y;
  const cz = q.x * v.y - q.y * v.x + q.w * v.z;
  return {
    x: v.x + 2 * (q.y * cz - q.z * cy),
    y: v.y + 2 * (q.z * cx - q.x * cz),
    z: v.z + 2 * (q.x * cy - q.y * cx),
  };
}

/** Three.js's forward (`0, 0, -1`) rotated by a quaternion. */
export function forwardFromQuaternion(q: MutableQuat): MutableVec3 {
  return rotateVectorByQuaternion({ x: 0, y: 0, z: -1 }, q);
}

/**
 * Horizontal heading from a head/camera quaternion: 0 at the default forward (-Z, matching the
 * fixed placement's un-rotated drum). Ignores pitch and roll (looking up/down or tilting the head
 * does not move the rig). Round-trips through `quatFromAxisAngle(0, 1, 0, yaw)`: building a yaw
 * quaternion from this value and rotating `(0, 0, -1)` by it reproduces the same forward vector.
 */
export function yawFromQuaternion(q: MutableQuat): number {
  const forward = forwardFromQuaternion(q);
  return Math.atan2(-forward.x, -forward.z);
}

export function clampEyeHeightMeters(eyeHeightMeters: number, config: AppConfig): number {
  const { minEyeHeightMeters, maxEyeHeightMeters } = config.adaptivePlacement;
  if (!Number.isFinite(eyeHeightMeters)) {
    return config.drumPlacement.defaultEyeLevelMeters;
  }
  return Math.min(maxEyeHeightMeters, Math.max(minEyeHeightMeters, eyeHeightMeters));
}

export interface AdaptiveDrumPose {
  readonly position: MutableVec3;
  readonly quaternion: MutableQuat;
}

/**
 * The drum's world pose for a head at `headWorld` facing `headYawRad` (see `yawFromQuaternion`):
 * `distanceAheadMeters` along the head's forward direction, `belowEyeLevelMeters` below the
 * (clamped) eye height, yawed to face the player, tilted by `drumTiltDeg` exactly as the fixed
 * placement was (tilt applied in the drum's own frame, then the whole drum yawed to face the
 * player). The eye-to-top-head-centre reach distance this produces is identical to the fixed
 * placement's for every yaw and every eye height inside `[minEyeHeightMeters,
 * maxEyeHeightMeters]`: yawing and translating the whole drum together is a rigid rotation of the
 * eye-to-drum vector around the eye, which does not change its length, and the clamp leaves the
 * vector's length untouched for any eye height already inside the clamped range.
 */
export function computeAdaptiveDrumPose(
  headWorld: Vec3Like,
  headYawRad: number,
  config: AppConfig = APP_CONFIG,
): AdaptiveDrumPose {
  const { distanceAheadMeters, belowEyeLevelMeters, drumTiltDeg } = config.drumPlacement;
  const clampedY = clampEyeHeightMeters(headWorld.y, config);
  const yawQuat = quatFromAxisAngle(0, 1, 0, headYawRad);
  const forward = forwardFromQuaternion(yawQuat);
  const position: MutableVec3 = {
    x: headWorld.x + forward.x * distanceAheadMeters,
    y: clampedY - belowEyeLevelMeters,
    z: headWorld.z + forward.z * distanceAheadMeters,
  };
  const tiltQuat = quatFromAxisAngle(1, 0, 0, (drumTiltDeg * Math.PI) / 180);
  const quaternion = quatMultiply(yawQuat, tiltQuat);
  return { position, quaternion };
}
