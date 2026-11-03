import { createSystem, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { APP_CONFIG } from '../app/config.js';
import { getAppFlags } from '../app/flags.js';
import { TalkingDrum } from '../app/talking-drum-component.js';
import {
  computeAdaptiveDrumPose,
  yawFromQuaternion,
  type MutableQuat,
} from './adaptive-placement.js';

const ATTEMPT_PHASES = new Set(['DEMO', 'YOUR_TURN']);

function lessonAttemptInProgress(): boolean {
  const phase = window.__talkingDrumLesson?.phase;
  return phase !== undefined && ATTEMPT_PHASES.has(phase);
}

/**
 * Places the drum (and, through the existing "offset from the live drum transform" systems —
 * `PitchLadderSystem`, `LessonSystem`'s panel, `VrDebugPanelSystem` — everything anchored to it)
 * relative to the player's head at the start of a VR session, instead of the scene's fixed world
 * position. VR only: desktop play mode (`DesktopModeSystem`) never enters an immersive session, so
 * it always sees the scene's authored placement. `?place=fixed` and
 * `APP_CONFIG.adaptivePlacement.enabled: false` both force that same fixed placement in VR too.
 *
 * Waits for the head pose to sit still (`stableWindowMs`, `stablePositionEpsilonMeters`) before
 * placing once per session, then re-places only on a reference-space reset (a recentre) — and,
 * per the task, never while a lesson attempt (`DEMO` / `YOUR_TURN`) is in progress; a recentre
 * mid-attempt is deferred until the attempt ends.
 */
export class AdaptivePlacementSystem extends createSystem({
  drums: { required: [TalkingDrum] },
}) {
  private readonly cfg = APP_CONFIG.adaptivePlacement;
  private readonly fixedByFlag = getAppFlags().place === 'fixed';

  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly lastStableHeadPos = new Vector3(Number.NaN, Number.NaN, Number.NaN);
  private readonly scratchVec3 = new Vector3();
  private readonly scratchQuat = new Quaternion();
  private readonly parentWorldQuat = new Quaternion();
  private stableSinceMs = Number.NaN;
  private placedThisSession = false;
  private pendingReplace = false;
  private wasImmersive = false;
  private observedReferenceSpace: XRReferenceSpace | null = null;
  private readonly onReferenceSpaceReset = (): void => {
    this.placedThisSession = false;
    this.pendingReplace = true;
  };

  update(_delta: number, timeMs: number): void {
    if (!this.cfg.enabled || this.fixedByFlag) {
      return;
    }

    const isImmersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const referenceSpace = this.world.xrReferenceSpace ?? null;
    if (referenceSpace !== this.observedReferenceSpace) {
      this.observedReferenceSpace?.removeEventListener('reset', this.onReferenceSpaceReset);
      referenceSpace?.addEventListener('reset', this.onReferenceSpaceReset);
      this.observedReferenceSpace = referenceSpace;
    }

    if (!isImmersive) {
      if (this.wasImmersive) {
        // A new session starts its own stabilisation and placement from scratch.
        this.placedThisSession = false;
        this.pendingReplace = false;
        this.stableSinceMs = Number.NaN;
        this.wasImmersive = false;
      }
      return;
    }
    this.wasImmersive = true;

    if (this.placedThisSession && !this.pendingReplace) {
      return;
    }
    if (this.pendingReplace && lessonAttemptInProgress()) {
      // Deferred recentre: wait for the current attempt to finish before moving the rig.
      return;
    }

    let drumObj = null;
    for (const entity of this.queries.drums.entities) {
      if (entity.object3D != null) {
        drumObj = entity.object3D;
        break;
      }
    }
    if (drumObj == null) {
      return;
    }

    this.player.head.updateWorldMatrix(true, false);
    this.headPos.setFromMatrixPosition(this.player.head.matrixWorld);
    this.headQuat.setFromRotationMatrix(this.player.head.matrixWorld);

    const nowFiniteMs = timeMs * 1000;
    const moved = this.lastStableHeadPos.distanceTo(this.headPos);
    if (!(moved <= this.cfg.stablePositionEpsilonMeters)) {
      this.lastStableHeadPos.copy(this.headPos);
      this.stableSinceMs = nowFiniteMs;
      return;
    }
    if (!Number.isFinite(this.stableSinceMs)) {
      this.stableSinceMs = nowFiniteMs;
    }
    if (nowFiniteMs - this.stableSinceMs < this.cfg.stableWindowMs) {
      return;
    }

    const yawRad = yawFromQuaternion(this.headQuat as unknown as MutableQuat);
    const { position, quaternion } = computeAdaptiveDrumPose(this.headPos, yawRad, APP_CONFIG);

    const parent = drumObj.parent;
    if (parent != null) {
      parent.updateWorldMatrix(true, false);
      this.scratchVec3.set(position.x, position.y, position.z);
      parent.worldToLocal(this.scratchVec3);
      drumObj.position.copy(this.scratchVec3);

      this.scratchQuat.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      parent.getWorldQuaternion(this.parentWorldQuat).invert();
      drumObj.quaternion.copy(this.parentWorldQuat).multiply(this.scratchQuat);
    } else {
      drumObj.position.set(position.x, position.y, position.z);
      drumObj.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }

    this.placedThisSession = true;
    this.pendingReplace = false;
  }
}
