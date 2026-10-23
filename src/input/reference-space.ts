import type { Matrix4 } from '@iwsdk/core';

/**
 * Player-rig transform safeguard.
 *
 * XR joint poses from `frame.getJointPose(joint, world.xrReferenceSpace)` are expressed in the
 * tracking reference space, which IWSDK parents under `world.player` (the rig). They equal world
 * coordinates only while the rig sits at the identity transform. Composing
 * `inverse(drumWorld) * playerWorld` maps reference-space points straight into drum-local space,
 * so strike detection stays correct if a scene authors `player.transform` or the rig is moved.
 * With an identity rig the result is exactly `inverse(drumWorld)`.
 */
export function composeReferenceSpaceToDrumLocal(
  out: Matrix4,
  inverseDrumWorld: Matrix4,
  playerWorld: Matrix4,
): Matrix4 {
  return out.multiplyMatrices(inverseDrumWorld, playerWorld);
}

/** True when a column-major 4x4 matrix is the identity within `epsilon`. */
export function isIdentityMatrixElements(elements: ArrayLike<number>, epsilon = 1e-6): boolean {
  for (let i = 0; i < 16; i += 1) {
    const expected = i % 5 === 0 ? 1 : 0;
    if (Math.abs(elements[i] - expected) > epsilon) {
      return false;
    }
  }
  return true;
}
