import { createSystem, Quaternion, Vector3 } from '@iwsdk/core';
import { APP_CONFIG } from '../app/config.js';
import { getAppFlags } from '../app/flags.js';
import { TalkingDrum } from '../app/talking-drum-component.js';
import { DebugHud } from '../debug/debug-hud.js';
import { StrikeSystem } from '../game/strike-system.js';
import { drumAudio } from './audio-unlock.js';
import type { DrumAudioDiagnostics } from './drum-audio.js';

declare global {
  interface Window {
    __talkingDrumAudio?: DrumAudioDiagnostics;
  }
}

const HUD_PROBE_REFRESH_MS = 500;

/**
 * Plays the drum voice for every StrikeSystem hit and keeps the HRTF panner on the struck head
 * and the Web Audio listener on the player's head. No audio code lives in the pure detector.
 */
export class DrumAudioSystem extends createSystem({
  drums: { required: [TalkingDrum] },
}) {
  private readonly drumWorldPos = new Vector3();
  private readonly drumWorldQuat = new Quaternion();
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly scratch = new Vector3();
  private debugEnabled = false;
  private lastHudRefreshMs = -Infinity;

  init(): void {
    this.debugEnabled = getAppFlags().debug;
    if (typeof window !== 'undefined') {
      window.__talkingDrumAudio = drumAudio.diagnostics;
    }
    void drumAudio.prepare();

    const unsubscribe = StrikeSystem.onStrike((event) => {
      drumAudio.play({ velocity: event.hit.speed }, event.frameEntryPerfNowMs);
      if (this.debugEnabled) {
        DebugHud.active?.updateAudioProbe(drumAudio.diagnostics);
      }
    });
    this.cleanupFuncs.push(unsubscribe);
  }

  update(): void {
    if (this.debugEnabled) {
      const nowMs = performance.now();
      if (nowMs - this.lastHudRefreshMs >= HUD_PROBE_REFRESH_MS) {
        this.lastHudRefreshMs = nowMs;
        drumAudio.refreshContextDiagnostics();
        DebugHud.active?.updateAudioProbe(drumAudio.diagnostics);
      }
    }

    if (drumAudio.context === null) {
      return;
    }

    for (const entity of this.queries.drums.entities) {
      const obj = entity.object3D;
      if (obj == null) {
        continue;
      }
      obj.updateWorldMatrix(true, false);
      this.drumWorldPos.setFromMatrixPosition(obj.matrixWorld);
      this.drumWorldQuat.setFromRotationMatrix(obj.matrixWorld);
      this.scratch
        .set(0, 1, 0)
        .applyQuaternion(this.drumWorldQuat)
        .multiplyScalar(APP_CONFIG.drumGeometry.lengthMeters / 2)
        .add(this.drumWorldPos);
      drumAudio.setDrumPosition(this.scratch.x, this.scratch.y, this.scratch.z);
      break;
    }

    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    this.headPos.setFromMatrixPosition(head.matrixWorld);
    this.headQuat.setFromRotationMatrix(head.matrixWorld);
    const { x: px, y: py, z: pz } = this.headPos;
    this.scratch.set(0, 0, -1).applyQuaternion(this.headQuat);
    const { x: fx, y: fy, z: fz } = this.scratch;
    this.scratch.set(0, 1, 0).applyQuaternion(this.headQuat);
    drumAudio.setListenerPose(
      px,
      py,
      pz,
      fx,
      fy,
      fz,
      this.scratch.x,
      this.scratch.y,
      this.scratch.z,
    );
  }
}
