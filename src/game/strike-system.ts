import { createSystem, Matrix4, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { APP_CONFIG, type Handedness } from '../app/config.js';
import { getAppFlags } from '../app/flags.js';
import { TalkingDrum } from '../app/talking-drum-component.js';
import { DebugHud, type DebugHudTelemetry } from '../debug/debug-hud.js';
import { frameTiming } from '../debug/frame-timing.js';
import { HandTracker, type HandTrackingQuality } from '../input/hand-tracker.js';
import {
  composeReferenceSpaceToDrumLocal,
  isIdentityMatrixElements,
} from '../input/reference-space.js';
import {
  createInitialStrikeHandState,
  detectStrike,
  type HandStrikeSample,
  type InternalStrikeEvent,
  resetStrikeHandHistory,
  type StrikeDetectorHandState,
} from './strike-detector.js';

export type StrikeEventListener = (event: Readonly<InternalStrikeEvent>) => void;

export interface TalkingDrumRuntimeDiagnostics {
  drumReady: boolean;
  drumWorldPosition: { x: number; y: number; z: number };
  drumWorldQuaternion: { x: number; y: number; z: number; w: number };
  drumTopHeadNormalWorld: { x: number; y: number; z: number };
  drumTopHeadCenterWorld: { x: number; y: number; z: number };
  primaryHand: Handedness;
  handState: HandTrackingQuality;
  rawWorld: { x: number; y: number; z: number };
  rawLocal: { x: number; y: number; z: number };
  strikeLocal: { x: number; y: number; z: number };
  skinDistanceMeters: number;
  strikeCount: number;
  lastStrikeSpeedMps: number;
  lastStrikeRadialMeters: number;
  lastFrameTimestampMs: number;
  /** False when the player rig is not at identity (reference-space poses are re-based onto it). */
  playerRigIsIdentity: boolean;
}

declare global {
  interface Window {
    __talkingDrumRuntime?: TalkingDrumRuntimeDiagnostics;
  }
}

interface HandDetectorChannel {
  state: StrikeDetectorHandState;
  hasPrevSample: boolean;
  prevSample: {
    timeMs: number;
    localPosition: { x: number; y: number; z: number };
    hand: Handedness;
  };
  currSample: {
    timeMs: number;
    localPosition: { x: number; y: number; z: number };
    hand: Handedness;
  };
}

function createHandDetectorChannel(hand: Handedness): HandDetectorChannel {
  return {
    state: createInitialStrikeHandState(),
    hasPrevSample: false,
    prevSample: {
      timeMs: 0,
      localPosition: { x: 0, y: 0, z: 0 },
      hand,
    },
    currSample: {
      timeMs: 0,
      localPosition: { x: 0, y: 0, z: 0 },
      hand,
    },
  };
}

function resetHandDetectorChannel(channel: HandDetectorChannel): void {
  channel.hasPrevSample = false;
  resetStrikeHandHistory(channel.state);
}

function findHandInputSource(
  session: XRSession | undefined,
  handedness: Handedness,
): XRInputSource | null {
  if (session?.inputSources == null) {
    return null;
  }
  for (const source of session.inputSources) {
    if (source.handedness === handedness && source.hand != null) {
      return source;
    }
  }
  return null;
}

export class StrikeSystem extends createSystem({
  drums: { required: [TalkingDrum] },
}) {
  private static readonly strikeListeners: StrikeEventListener[] = [];

  static onStrike(listener: StrikeEventListener): () => void {
    StrikeSystem.strikeListeners.push(listener);
    return () => {
      const idx = StrikeSystem.strikeListeners.indexOf(listener);
      if (idx !== -1) {
        StrikeSystem.strikeListeners.splice(idx, 1);
      }
    };
  }

  private readonly handTracker = new HandTracker(APP_CONFIG);
  private readonly detectorChannels: Record<Handedness, HandDetectorChannel> = {
    left: createHandDetectorChannel('left'),
    right: createHandDetectorChannel('right'),
  };
  private readonly invDrumWorldMatrix = new Matrix4();
  private readonly referenceToDrumLocalMatrix = new Matrix4();
  private readonly drumWorldPos = new Vector3();
  private readonly drumWorldQuat = new Quaternion();
  private readonly topHeadNormalWorld = new Vector3();
  private readonly topHeadCenterWorld = new Vector3();
  private readonly hudTelemetryScratch: DebugHudTelemetry = {
    handedness: 'right',
    handState: 'UNTRACKED',
    skinDistanceMeters: Number.NaN,
    strikeCount: 0,
    lastStrikeSpeedMps: 0,
    lastStrikeRadialMeters: 0,
  };
  private readonly diagnostics: TalkingDrumRuntimeDiagnostics = {
    drumReady: false,
    drumWorldPosition: { x: 0, y: 0, z: 0 },
    drumWorldQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    drumTopHeadNormalWorld: { x: 0, y: 1, z: 0 },
    drumTopHeadCenterWorld: { x: 0, y: 0, z: 0 },
    primaryHand: 'right',
    handState: 'UNTRACKED',
    rawWorld: { x: 0, y: 0, z: 0 },
    rawLocal: { x: 0, y: 0, z: 0 },
    strikeLocal: { x: 0, y: 0, z: 0 },
    skinDistanceMeters: Number.NaN,
    strikeCount: 0,
    lastStrikeSpeedMps: 0,
    lastStrikeRadialMeters: 0,
    lastFrameTimestampMs: 0,
    playerRigIsIdentity: true,
  };

  private debugHud: DebugHud | null = null;
  private primaryHand: Handedness = APP_CONFIG.strike.primaryHand;
  private secondaryHand: Handedness = 'left';
  private allowSecondaryHand: boolean = APP_CONFIG.strike.allowSecondaryHand;
  private strikeCount = 0;
  private lastStrikeSpeedMps = 0;
  private lastStrikeRadialMeters = 0;
  private wasImmersive = false;
  private frameEntryPerfNowMs = 0;
  private debugEnabled = false;

  init(): void {
    const flags = getAppFlags();
    this.primaryHand = flags.hand ?? APP_CONFIG.strike.primaryHand;
    this.secondaryHand = this.primaryHand === 'right' ? 'left' : 'right';
    this.allowSecondaryHand = APP_CONFIG.strike.allowSecondaryHand;
    this.diagnostics.primaryHand = this.primaryHand;
    this.hudTelemetryScratch.handedness = this.primaryHand;

    if (typeof window !== 'undefined') {
      window.__talkingDrumRuntime = this.diagnostics;
    }

    this.debugEnabled = flags.debug;
    if (flags.debug) {
      this.debugHud = new DebugHud();
      this.debugHud.mount();
      this.hudTelemetryScratch.handedness = this.primaryHand;
      this.debugHud.updateTelemetry(this.hudTelemetryScratch, 0, true);
      this.cleanupFuncs.push(() => this.debugHud?.dispose());
    }

    const unsubQualify = this.queries.drums.subscribe('qualify', (entity) => {
      const obj = entity.object3D;
      if (obj != null) {
        this.refreshDrumTransformDiagnostics(obj);
      }
    });
    const unsubDisqualify = this.queries.drums.subscribe('disqualify', () => {
      this.diagnostics.drumReady = false;
    });
    const unsubVisibility = this.world.visibilityState.subscribe((state) => {
      if (state === VisibilityState.NonImmersive) {
        this.handTracker.reset();
        resetHandDetectorChannel(this.detectorChannels.left);
        resetHandDetectorChannel(this.detectorChannels.right);
      }
    });

    this.cleanupFuncs.push(unsubQualify, unsubDisqualify, unsubVisibility);
  }

  private refreshDrumTransformDiagnostics(drumObj: {
    updateWorldMatrix: (updateParents: boolean, updateChildren: boolean) => void;
    matrixWorld: Matrix4;
  }): void {
    drumObj.updateWorldMatrix(true, false);
    this.invDrumWorldMatrix.copy(drumObj.matrixWorld).invert();
    this.drumWorldPos.setFromMatrixPosition(drumObj.matrixWorld);
    this.drumWorldQuat.setFromRotationMatrix(drumObj.matrixWorld);
    this.topHeadNormalWorld.set(0, 1, 0).applyQuaternion(this.drumWorldQuat).normalize();
    this.topHeadCenterWorld
      .copy(this.topHeadNormalWorld)
      .multiplyScalar(APP_CONFIG.drumGeometry.lengthMeters / 2)
      .add(this.drumWorldPos);

    this.diagnostics.drumReady = true;
    this.diagnostics.drumWorldPosition.x = this.drumWorldPos.x;
    this.diagnostics.drumWorldPosition.y = this.drumWorldPos.y;
    this.diagnostics.drumWorldPosition.z = this.drumWorldPos.z;
    this.diagnostics.drumWorldQuaternion.x = this.drumWorldQuat.x;
    this.diagnostics.drumWorldQuaternion.y = this.drumWorldQuat.y;
    this.diagnostics.drumWorldQuaternion.z = this.drumWorldQuat.z;
    this.diagnostics.drumWorldQuaternion.w = this.drumWorldQuat.w;
    this.diagnostics.drumTopHeadNormalWorld.x = this.topHeadNormalWorld.x;
    this.diagnostics.drumTopHeadNormalWorld.y = this.topHeadNormalWorld.y;
    this.diagnostics.drumTopHeadNormalWorld.z = this.topHeadNormalWorld.z;
    this.diagnostics.drumTopHeadCenterWorld.x = this.topHeadCenterWorld.x;
    this.diagnostics.drumTopHeadCenterWorld.y = this.topHeadCenterWorld.y;
    this.diagnostics.drumTopHeadCenterWorld.z = this.topHeadCenterWorld.z;
  }

  private processHand(
    handedness: Handedness,
    frame: XRFrame | null,
    referenceSpace: XRReferenceSpace | null,
    session: XRSession | undefined,
    frameTimestampMs: number,
    isPrimary: boolean,
  ): boolean {
    const inputSource = findHandInputSource(session, handedness);
    const sample = this.handTracker.sampleXrHand(
      handedness,
      frame,
      referenceSpace,
      inputSource,
      this.referenceToDrumLocalMatrix.elements,
      frameTimestampMs,
    );

    if (isPrimary) {
      this.diagnostics.handState = sample.quality;
      this.diagnostics.rawWorld.x = sample.rawWorld.x;
      this.diagnostics.rawWorld.y = sample.rawWorld.y;
      this.diagnostics.rawWorld.z = sample.rawWorld.z;
      this.diagnostics.rawLocal.x = sample.rawLocal.x;
      this.diagnostics.rawLocal.y = sample.rawLocal.y;
      this.diagnostics.rawLocal.z = sample.rawLocal.z;
      this.diagnostics.strikeLocal.x = sample.strikeLocal.x;
      this.diagnostics.strikeLocal.y = sample.strikeLocal.y;
      this.diagnostics.strikeLocal.z = sample.strikeLocal.z;
      this.diagnostics.skinDistanceMeters = sample.skinDistanceMeters;
      this.hudTelemetryScratch.handedness = handedness;
      this.hudTelemetryScratch.handState = sample.quality;
      this.hudTelemetryScratch.skinDistanceMeters = sample.skinDistanceMeters;
    }

    const channel = this.detectorChannels[handedness];
    if (sample.quality === 'UNTRACKED') {
      resetHandDetectorChannel(channel);
      return false;
    }

    if (!channel.hasPrevSample) {
      channel.prevSample.timeMs = frameTimestampMs;
      channel.prevSample.localPosition.x = sample.strikeLocal.x;
      channel.prevSample.localPosition.y = sample.strikeLocal.y;
      channel.prevSample.localPosition.z = sample.strikeLocal.z;
      channel.prevSample.hand = handedness;
      channel.hasPrevSample = true;
      return false;
    }

    channel.currSample.timeMs = frameTimestampMs;
    channel.currSample.localPosition.x = sample.strikeLocal.x;
    channel.currSample.localPosition.y = sample.strikeLocal.y;
    channel.currSample.localPosition.z = sample.strikeLocal.z;
    channel.currSample.hand = handedness;

    const hit = detectStrike(
      channel.prevSample as HandStrikeSample,
      channel.currSample as HandStrikeSample,
      channel.state,
      APP_CONFIG,
    );

    channel.prevSample.timeMs = frameTimestampMs;
    channel.prevSample.localPosition.x = sample.strikeLocal.x;
    channel.prevSample.localPosition.y = sample.strikeLocal.y;
    channel.prevSample.localPosition.z = sample.strikeLocal.z;

    if (hit === null) {
      return false;
    }

    const radialDistanceMeters = Math.hypot(hit.position.x, hit.position.z);
    this.strikeCount += 1;
    this.lastStrikeSpeedMps = hit.speed;
    this.lastStrikeRadialMeters = radialDistanceMeters;

    this.diagnostics.strikeCount = this.strikeCount;
    this.diagnostics.lastStrikeSpeedMps = this.lastStrikeSpeedMps;
    this.diagnostics.lastStrikeRadialMeters = this.lastStrikeRadialMeters;
    this.diagnostics.lastFrameTimestampMs = frameTimestampMs;

    const listeners = StrikeSystem.strikeListeners;
    if (listeners.length > 0) {
      const event: InternalStrikeEvent = {
        hit,
        hand: handedness,
        frameTimestampMs,
        frameEntryPerfNowMs: this.frameEntryPerfNowMs,
      };
      for (let i = 0; i < listeners.length; i += 1) {
        listeners[i](event);
      }
    }

    return true;
  }

  update(_delta: number, time: number): void {
    this.frameEntryPerfNowMs = performance.now();
    if (this.debugEnabled) {
      frameTiming.recordFrameEntry(this.frameEntryPerfNowMs);
    }
    const frameTimestampMs = time * 1000;
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

    this.refreshDrumTransformDiagnostics(drumObj);

    const isImmersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!isImmersive) {
      if (this.wasImmersive) {
        this.handTracker.reset();
        resetHandDetectorChannel(this.detectorChannels.left);
        resetHandDetectorChannel(this.detectorChannels.right);
        this.wasImmersive = false;
      }
      this.diagnostics.handState = 'UNTRACKED';
      this.diagnostics.skinDistanceMeters = Number.NaN;
      this.hudTelemetryScratch.handState = 'UNTRACKED';
      this.hudTelemetryScratch.skinDistanceMeters = Number.NaN;
      this.hudTelemetryScratch.strikeCount = this.strikeCount;
      this.hudTelemetryScratch.lastStrikeSpeedMps = this.lastStrikeSpeedMps;
      this.hudTelemetryScratch.lastStrikeRadialMeters = this.lastStrikeRadialMeters;
      this.debugHud?.updateTelemetry(this.hudTelemetryScratch, frameTimestampMs, false);
      return;
    }

    this.wasImmersive = true;
    this.player.updateWorldMatrix(true, false);
    composeReferenceSpaceToDrumLocal(
      this.referenceToDrumLocalMatrix,
      this.invDrumWorldMatrix,
      this.player.matrixWorld,
    );
    this.diagnostics.playerRigIsIdentity = isIdentityMatrixElements(
      this.player.matrixWorld.elements,
    );
    const frame = this.world.xrFrame;
    const referenceSpace = this.world.xrReferenceSpace;
    const session = this.world.xrSession;

    let hitOccurred = this.processHand(
      this.primaryHand,
      frame,
      referenceSpace,
      session,
      frameTimestampMs,
      true,
    );

    if (this.allowSecondaryHand) {
      const secondaryHit = this.processHand(
        this.secondaryHand,
        frame,
        referenceSpace,
        session,
        frameTimestampMs,
        false,
      );
      hitOccurred = hitOccurred || secondaryHit;
    }

    this.hudTelemetryScratch.strikeCount = this.strikeCount;
    this.hudTelemetryScratch.lastStrikeSpeedMps = this.lastStrikeSpeedMps;
    this.hudTelemetryScratch.lastStrikeRadialMeters = this.lastStrikeRadialMeters;
    this.debugHud?.updateTelemetry(this.hudTelemetryScratch, frameTimestampMs, hitOccurred);
  }
}
