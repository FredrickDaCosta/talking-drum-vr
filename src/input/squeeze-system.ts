import { createSystem, VisibilityState } from '@iwsdk/core';
import { APP_CONFIG, type Handedness } from '../app/config.js';
import { getAppFlags } from '../app/flags.js';
import { DebugHud } from '../debug/debug-hud.js';
import { PitchBandClassifier, squeezeToPitchRatio } from '../game/pitch-mapping.js';
import { statusChannel } from '../ui/status-channel.js';
import {
  computeHandCurlInto,
  type HandCurlResult,
  SQUEEZE_JOINT_COUNT,
  SQUEEZE_JOINTS,
  SqueezeTracker,
  squeezeFromCurl,
} from './hand-squeeze.js';
import { pitchHand } from './left-hand-pitch.js';
import { SqueezeCalibration } from './squeeze-calibration.js';

const HUD_REFRESH_MS = 100;

/** WebXR Hand Input `XRFrame.fillPoses` (bulk, allocation-free); missing from TS DOM types. */
interface XRFrameFillPoses {
  fillPoses?: (spaces: XRSpace[], baseSpace: XRSpace, transforms: Float32Array) => boolean;
}

/**
 * Reads the pitch hand (the non-striking hand; left by default) every frame and publishes squeeze,
 * pitch band and pitch ratio to `pitchHand`. Registered before StrikeSystem so a strike in this
 * frame latches this frame's squeeze. Runs the guided open/fist calibration at session start
 * (skip with ?calib=0). The pitch hand never triggers strikes (allowSecondaryHand stays false).
 */
export class SqueezeSystem extends createSystem({}) {
  private readonly positions = new Float64Array(SQUEEZE_JOINT_COUNT * 3);
  private readonly matrices = new Float32Array(SQUEEZE_JOINT_COUNT * 16);
  private readonly curl: HandCurlResult = {
    curl: Number.NaN,
    palmLengthMeters: Number.NaN,
    validFingers: 0,
  };
  private readonly tracker = new SqueezeTracker(APP_CONFIG.squeeze);
  private readonly classifier = new PitchBandClassifier(APP_CONFIG.pitch);
  private calibration!: SqueezeCalibration;
  private squeezeHand: Handedness = 'left';
  private skipCalibration = false;
  private debugEnabled = false;
  private lastHudMs = -Infinity;
  private cachedHand: XRHand | null = null;
  private readonly jointSpaces: XRJointSpace[] = [];

  init(): void {
    const flags = getAppFlags();
    const primary = flags.hand ?? APP_CONFIG.strike.primaryHand;
    this.squeezeHand = primary === 'right' ? 'left' : 'right';
    this.skipCalibration = flags.calib === false;
    this.debugEnabled = flags.debug;
    this.calibration = new SqueezeCalibration(APP_CONFIG.squeeze, this.squeezeHand);
    pitchHand.hand = this.squeezeHand;
    this.publishCalibration();
    if (typeof window !== 'undefined') {
      window.__talkingDrumPitch = pitchHand;
    }

    const unsubscribe = this.world.visibilityState.subscribe((state) => {
      const nowMs = performance.now();
      if (state === VisibilityState.NonImmersive) {
        this.calibration.cancel();
        this.tracker.reset();
        this.classifier.reset();
        statusChannel.setCalibrationPrompt(null);
      } else if (this.calibration.phase === 'not-started') {
        this.calibration.start(nowMs, this.skipCalibration);
      }
      this.publishCalibration();
    });
    this.cleanupFuncs.push(unsubscribe, () => statusChannel.setCalibrationPrompt(null));
  }

  update(): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      return;
    }
    const nowMs = performance.now();
    this.readJoints();
    computeHandCurlInto(this.positions, this.curl, APP_CONFIG.squeeze);
    const rawCurl = this.curl.curl;

    this.calibration.update(nowMs, rawCurl);
    const rawSqueeze = squeezeFromCurl(
      rawCurl,
      this.calibration.openCurl,
      this.calibration.fistCurl,
    );
    const squeeze = this.tracker.update(rawSqueeze, nowMs);
    const band = this.classifier.update(squeeze);

    pitchHand.tracking = this.tracker.tracking;
    pitchHand.rawCurl = rawCurl;
    pitchHand.squeeze = squeeze;
    pitchHand.band = band;
    pitchHand.pitchRatio = squeezeToPitchRatio(squeeze, APP_CONFIG.pitch);
    this.publishCalibration();
    statusChannel.setCalibrationPrompt(this.calibration.prompt(nowMs));

    if (this.debugEnabled && nowMs - this.lastHudMs >= HUD_REFRESH_MS) {
      this.lastHudMs = nowMs;
      DebugHud.active?.updatePitchProbe(pitchHand);
    }
  }

  private publishCalibration(): void {
    pitchHand.calibration = this.calibration.phase;
    pitchHand.calibrationOpenCurl = this.calibration.openCurl;
    pitchHand.calibrationFistCurl = this.calibration.fistCurl;
    pitchHand.calibrationFailureReason = this.calibration.failureReason;
  }

  /** Fills `positions` for SQUEEZE_JOINTS (NaN for anything unavailable). */
  private readJoints(): void {
    this.positions.fill(Number.NaN);
    const frame = this.world.xrFrame;
    const refSpace = this.world.xrReferenceSpace;
    const sources = this.world.xrSession?.inputSources;
    if (frame == null || refSpace == null || sources == null) {
      return;
    }
    let hand: XRHand | null = null;
    for (let i = 0; i < sources.length; i += 1) {
      const source = sources[i];
      if (source.handedness === this.squeezeHand && source.hand != null) {
        hand = source.hand;
        break;
      }
    }
    if (hand === null) {
      return;
    }
    if (hand !== this.cachedHand) {
      this.cacheJointSpaces(hand);
    }
    if (this.jointSpaces.length !== SQUEEZE_JOINT_COUNT) {
      return;
    }

    const bulk = frame as XRFrame & XRFrameFillPoses;
    if (typeof bulk.fillPoses === 'function') {
      if (bulk.fillPoses(this.jointSpaces, refSpace, this.matrices)) {
        for (let j = 0; j < SQUEEZE_JOINT_COUNT; j += 1) {
          this.positions[j * 3] = this.matrices[j * 16 + 12];
          this.positions[j * 3 + 1] = this.matrices[j * 16 + 13];
          this.positions[j * 3 + 2] = this.matrices[j * 16 + 14];
        }
      }
      return;
    }
    if (typeof frame.getJointPose !== 'function') {
      return;
    }
    for (let j = 0; j < SQUEEZE_JOINT_COUNT; j += 1) {
      const pose = frame.getJointPose(this.jointSpaces[j], refSpace);
      if (pose != null) {
        const p = pose.transform.position;
        this.positions[j * 3] = p.x;
        this.positions[j * 3 + 1] = p.y;
        this.positions[j * 3 + 2] = p.z;
      }
    }
  }

  /** Runs only when the XRHand object changes (new input source), not per frame. */
  private cacheJointSpaces(hand: XRHand): void {
    this.cachedHand = hand;
    this.jointSpaces.length = 0;
    for (const name of SQUEEZE_JOINTS) {
      const space = hand.get(name);
      if (space == null) {
        this.jointSpaces.length = 0;
        return;
      }
      this.jointSpaces.push(space);
    }
  }
}
