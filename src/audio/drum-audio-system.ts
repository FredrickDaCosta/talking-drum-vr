import { createSystem, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { APP_CONFIG } from '../app/config.js';
import { getAppFlags } from '../app/flags.js';
import { TalkingDrum } from '../app/talking-drum-component.js';
import { DebugHud, type DebugHudAudioProbe } from '../debug/debug-hud.js';
import { DEBUG_MAX_WINDOW_MS, frameTiming } from '../debug/frame-timing.js';
import { RollingMaxWindow } from '../debug/rolling-max.js';
import { StrikeSystem } from '../game/strike-system.js';
import { latchPitchForStrike } from '../input/left-hand-pitch.js';
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
  private readonly pipelineWindow = new RollingMaxWindow(DEBUG_MAX_WINDOW_MS, 128);
  private readonly probe: DebugHudAudioProbe = {
    contextState: 'no-context',
    voicesStartedCount: 0,
    activeVoices: 0,
    lastSoftwarePipelineMs: Number.NaN,
    maxPipelineMs5s: Number.NaN,
    maxFrameGapMs5s: Number.NaN,
    baseLatencyMs: Number.NaN,
    outputLatencyMs: Number.NaN,
    skipped: drumAudio.diagnostics.skipped,
  };

  init(): void {
    this.debugEnabled = getAppFlags().debug;
    if (typeof window !== 'undefined') {
      window.__talkingDrumAudio = drumAudio.diagnostics;
    }
    void drumAudio.prepare();

    const unsubscribe = StrikeSystem.onStrike((event) => {
      // SqueezeSystem ran earlier this frame, so this latches the pitch hand at the strike frame.
      const pitchRatio = latchPitchForStrike();
      const outcome = drumAudio.play(
        { velocity: event.hit.speed, pitchRatio },
        event.frameEntryPerfNowMs,
      );
      if (this.debugEnabled) {
        if (outcome === 'played') {
          this.pipelineWindow.push(
            event.frameEntryPerfNowMs,
            drumAudio.diagnostics.lastSoftwarePipelineMs,
          );
        }
        this.refreshHudProbe(performance.now());
      }
    });
    // XR session start/end (immersive <-> non-immersive) can leave the context suspended.
    let previousVisibility = this.world.visibilityState.peek();
    const unsubscribeVisibility = this.world.visibilityState.subscribe((state) => {
      const sessionBoundary =
        (state === VisibilityState.NonImmersive) !==
        (previousVisibility === VisibilityState.NonImmersive);
      previousVisibility = state;
      if (sessionBoundary) {
        drumAudio.requestResume('xr-session');
      }
    });
    this.cleanupFuncs.push(unsubscribe, unsubscribeVisibility);
  }

  /** Debug HUD only: copies diagnostics into a pre-allocated probe (no per-frame allocation). */
  private refreshHudProbe(nowMs: number): void {
    this.lastHudRefreshMs = nowMs;
    drumAudio.refreshContextDiagnostics();
    const d = drumAudio.diagnostics;
    const p = this.probe;
    p.contextState = d.contextState;
    p.voicesStartedCount = d.voicesStartedCount;
    p.activeVoices = d.activeVoices;
    p.lastSoftwarePipelineMs = d.lastSoftwarePipelineMs;
    p.maxPipelineMs5s = this.pipelineWindow.max(nowMs);
    p.maxFrameGapMs5s = frameTiming.maxFrameGapMs(nowMs);
    p.baseLatencyMs = d.baseLatencyMs;
    p.outputLatencyMs = d.outputLatencyMs;
    DebugHud.active?.updateAudioProbe(p);
  }

  update(): void {
    if (this.debugEnabled) {
      const nowMs = performance.now();
      if (nowMs - this.lastHudRefreshMs >= HUD_PROBE_REFRESH_MS) {
        this.refreshHudProbe(nowMs);
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
