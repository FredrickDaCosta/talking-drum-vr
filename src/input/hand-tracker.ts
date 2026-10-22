import {
  APP_CONFIG,
  type AppConfig,
  type Handedness,
  type StrikePointMode,
} from '../app/config.js';
import { type MutableVec3, OneEuroFilter3D, type Vec3Like } from './one-euro-filter.js';

export type HandTrackingQuality = 'UNTRACKED' | 'TRACKED' | 'EMULATED';

export interface JointPoseSample {
  x: number;
  y: number;
  z: number;
  emulatedPosition?: boolean;
}

export interface HandJointPoseInput {
  wrist?: JointPoseSample | null;
  middleFingerMetacarpal?: JointPoseSample | null;
  indexFingerTip?: JointPoseSample | null;
}

export interface StrikePointOptions {
  strikePointMode: StrikePointMode;
  allowEmulatedPoses: boolean;
}

export interface HandSample {
  handedness: Handedness;
  quality: HandTrackingQuality;
  timestampMs: number;
  rawWorld: MutableVec3;
  rawLocal: MutableVec3;
  /** Filtered drum-local coordinates from strikeFilter (fed to StrikeDetector). */
  strikeLocal: MutableVec3;
  /** Filtered drum-local coordinates from visualFilter (fed to hover & HUD distance only). */
  visualLocal: MutableVec3;
  /** Signed distance (meters) from visualLocal.y to the top drumhead plane (+y = lengthMeters / 2). */
  skinDistanceMeters: number;
}

export interface TiltedHeadReachMetrics {
  eyeWorld: MutableVec3;
  drumCenterWorld: MutableVec3;
  topHeadCenterWorld: MutableVec3;
  topHeadNormalWorld: MutableVec3;
  horizontalDistanceMeters: number;
  euclideanDistanceMeters: number;
}

function isFiniteSample(sample: JointPoseSample | null | undefined): sample is JointPoseSample {
  return (
    sample != null &&
    Number.isFinite(sample.x) &&
    Number.isFinite(sample.y) &&
    Number.isFinite(sample.z)
  );
}

/**
 * Pure helper that computes the strike point in world space from hand joint samples,
 * gating on missing/NaN poses and `emulatedPosition`. Zero heap allocations.
 */
export function computeStrikePointWorldInto(
  joints: HandJointPoseInput,
  options: StrikePointOptions,
  outWorld: MutableVec3,
): HandTrackingQuality {
  if (options.strikePointMode === 'index-finger-tip') {
    const tip = joints.indexFingerTip;
    if (!isFiniteSample(tip)) {
      return 'UNTRACKED';
    }
    const emulated = tip.emulatedPosition === true;
    if (emulated && !options.allowEmulatedPoses) {
      return 'UNTRACKED';
    }
    outWorld.x = tip.x;
    outWorld.y = tip.y;
    outWorld.z = tip.z;
    return emulated ? 'EMULATED' : 'TRACKED';
  }

  const wrist = joints.wrist;
  const metacarpal = joints.middleFingerMetacarpal;
  if (!isFiniteSample(wrist) || !isFiniteSample(metacarpal)) {
    return 'UNTRACKED';
  }
  const emulated = wrist.emulatedPosition === true || metacarpal.emulatedPosition === true;
  if (emulated && !options.allowEmulatedPoses) {
    return 'UNTRACKED';
  }

  outWorld.x = (wrist.x + metacarpal.x) * 0.5;
  outWorld.y = (wrist.y + metacarpal.y) * 0.5;
  outWorld.z = (wrist.z + metacarpal.z) * 0.5;
  return emulated ? 'EMULATED' : 'TRACKED';
}

/**
 * Pure, allocation-free affine point transform by a 16-element column-major 4x4 matrix
 * (matching Three.js `Matrix4.elements`).
 */
export function transformWorldPointToLocalInto(
  worldPoint: Vec3Like,
  invWorldMatrixElements: ArrayLike<number>,
  outLocal: MutableVec3,
): boolean {
  if (invWorldMatrixElements.length < 16) {
    return false;
  }
  const x = worldPoint.x;
  const y = worldPoint.y;
  const z = worldPoint.z;
  const lx =
    invWorldMatrixElements[0] * x +
    invWorldMatrixElements[4] * y +
    invWorldMatrixElements[8] * z +
    invWorldMatrixElements[12];
  const ly =
    invWorldMatrixElements[1] * x +
    invWorldMatrixElements[5] * y +
    invWorldMatrixElements[9] * z +
    invWorldMatrixElements[13];
  const lz =
    invWorldMatrixElements[2] * x +
    invWorldMatrixElements[6] * y +
    invWorldMatrixElements[10] * z +
    invWorldMatrixElements[14];

  if (!Number.isFinite(lx) || !Number.isFinite(ly) || !Number.isFinite(lz)) {
    return false;
  }
  outLocal.x = lx;
  outLocal.y = ly;
  outLocal.z = lz;
  return true;
}

/**
 * Pure-maths helper returning the world-space outward normal of the top drumhead (`+Y` local)
 * when tilted toward the seated player (+Z) by `drumTiltDeg` around the X axis.
 */
export function computeTiltedDrumTopHeadNormal(drumTiltDeg: number): MutableVec3 {
  const rad = (drumTiltDeg * Math.PI) / 180;
  return {
    x: 0,
    y: Math.cos(rad),
    z: Math.sin(rad),
  };
}

/**
 * Pure-maths helper returning the world-space centre of the top drumhead (`+halfLengthMeters` local Y)
 * when the drum is placed at `drumCenterWorld` and tilted by `drumTiltDeg` around the X axis.
 */
export function computeTiltedDrumTopHeadCenter(
  drumCenterWorld: Vec3Like,
  halfLengthMeters: number,
  drumTiltDeg: number,
): MutableVec3 {
  const normal = computeTiltedDrumTopHeadNormal(drumTiltDeg);
  return {
    x: drumCenterWorld.x + halfLengthMeters * normal.x,
    y: drumCenterWorld.y + halfLengthMeters * normal.y,
    z: drumCenterWorld.z + halfLengthMeters * normal.z,
  };
}

/**
 * Computes the tilted top-head centre position and reach distances relative to a default
 * seated eye position `(0, defaultEyeHeightMeters, 0)`.
 */
export function computeTiltedTopHeadReachFromEye(
  config: AppConfig = APP_CONFIG,
  defaultEyeHeightMeters = config.drumPlacement.defaultEyeLevelMeters,
): TiltedHeadReachMetrics {
  const eyeWorld: MutableVec3 = { x: 0, y: defaultEyeHeightMeters, z: 0 };
  const drumCenterWorld: MutableVec3 = {
    x: eyeWorld.x,
    y: eyeWorld.y - config.drumPlacement.belowEyeLevelMeters,
    z: eyeWorld.z - config.drumPlacement.distanceAheadMeters,
  };
  const halfLengthMeters = config.drumGeometry.lengthMeters / 2;
  const topHeadNormalWorld = computeTiltedDrumTopHeadNormal(config.drumPlacement.drumTiltDeg);
  const topHeadCenterWorld = computeTiltedDrumTopHeadCenter(
    drumCenterWorld,
    halfLengthMeters,
    config.drumPlacement.drumTiltDeg,
  );
  const dx = topHeadCenterWorld.x - eyeWorld.x;
  const dy = topHeadCenterWorld.y - eyeWorld.y;
  const dz = topHeadCenterWorld.z - eyeWorld.z;
  const horizontalDistanceMeters = Math.hypot(dx, dz);
  const euclideanDistanceMeters = Math.hypot(dx, dy, dz);
  return {
    eyeWorld,
    drumCenterWorld,
    topHeadCenterWorld,
    topHeadNormalWorld,
    horizontalDistanceMeters,
    euclideanDistanceMeters,
  };
}

interface InternalHandChannel {
  strikeFilter: OneEuroFilter3D;
  visualFilter: OneEuroFilter3D;
  lastValidTimestampMs: number | null;
  wristSample: JointPoseSample;
  metacarpalSample: JointPoseSample;
  indexTipSample: JointPoseSample;
  jointsInput: HandJointPoseInput;
  sample: HandSample;
}

function createHandChannel(handedness: Handedness, config: AppConfig): InternalHandChannel {
  return {
    strikeFilter: new OneEuroFilter3D(config.strikeFilter),
    visualFilter: new OneEuroFilter3D(config.visualFilter),
    lastValidTimestampMs: null,
    wristSample: { x: 0, y: 0, z: 0, emulatedPosition: false },
    metacarpalSample: { x: 0, y: 0, z: 0, emulatedPosition: false },
    indexTipSample: { x: 0, y: 0, z: 0, emulatedPosition: false },
    jointsInput: {
      wrist: null,
      middleFingerMetacarpal: null,
      indexFingerTip: null,
    },
    sample: {
      handedness,
      quality: 'UNTRACKED',
      timestampMs: 0,
      rawWorld: { x: 0, y: 0, z: 0 },
      rawLocal: { x: 0, y: 0, z: 0 },
      strikeLocal: { x: 0, y: 0, z: 0 },
      visualLocal: { x: 0, y: 0, z: 0 },
      skinDistanceMeters: Number.NaN,
    },
  };
}

function readJointIntoSample(
  frame: XRFrame,
  hand: XRHand,
  jointName: XRHandJoint,
  referenceSpace: XRReferenceSpace,
  target: JointPoseSample,
): JointPoseSample | null {
  if (typeof frame.getJointPose !== 'function') {
    return null;
  }
  const jointSpace = hand.get(jointName);
  if (jointSpace == null) {
    return null;
  }
  const pose = frame.getJointPose(jointSpace, referenceSpace);
  if (pose == null) {
    return null;
  }
  const pos = pose.transform.position;
  target.x = pos.x;
  target.y = pos.y;
  target.z = pos.z;
  target.emulatedPosition = pose.emulatedPosition === true;
  return target;
}

/**
 * Allocation-free WebXR hand-joint adapter that converts raw palm/index-tip poses into
 * drum-local coordinates and runs separate One-Euro filter paths for strike detection
 * (`strikeFilter`) and visual hover / HUD distance (`visualFilter`).
 */
export class HandTracker {
  private readonly config: AppConfig;
  private readonly channels: Record<Handedness, InternalHandChannel>;
  private readonly strikePointOptions: StrikePointOptions;
  private readonly halfLengthMeters: number;

  constructor(config: AppConfig = APP_CONFIG) {
    this.config = config;
    this.halfLengthMeters = config.drumGeometry.lengthMeters / 2;
    this.strikePointOptions = {
      strikePointMode: config.strike.strikePointMode,
      allowEmulatedPoses: config.handTracking.allowEmulatedPoses,
    };
    this.channels = {
      left: createHandChannel('left', config),
      right: createHandChannel('right', config),
    };
  }

  reset(handedness?: Handedness): void {
    if (handedness !== undefined) {
      this.resetChannel(this.channels[handedness]);
      return;
    }
    this.resetChannel(this.channels.left);
    this.resetChannel(this.channels.right);
  }

  private resetChannel(channel: InternalHandChannel): void {
    channel.strikeFilter.reset();
    channel.visualFilter.reset();
    channel.lastValidTimestampMs = null;
    channel.sample.quality = 'UNTRACKED';
    channel.sample.skinDistanceMeters = Number.NaN;
  }

  sampleHandFromJoints(
    handedness: Handedness,
    joints: HandJointPoseInput,
    invDrumWorldMatrixElements: ArrayLike<number>,
    timestampMs: number,
  ): Readonly<HandSample> {
    const channel = this.channels[handedness];
    const sample = channel.sample;
    sample.timestampMs = timestampMs;

    if (!Number.isFinite(timestampMs)) {
      this.resetChannel(channel);
      return sample;
    }

    const quality = computeStrikePointWorldInto(joints, this.strikePointOptions, sample.rawWorld);
    if (quality === 'UNTRACKED') {
      this.resetChannel(channel);
      return sample;
    }

    if (
      !transformWorldPointToLocalInto(sample.rawWorld, invDrumWorldMatrixElements, sample.rawLocal)
    ) {
      this.resetChannel(channel);
      return sample;
    }

    const maxGapMs = Math.min(this.config.strikeFilter.maxGapMs, this.config.visualFilter.maxGapMs);
    if (
      channel.lastValidTimestampMs !== null &&
      (timestampMs < channel.lastValidTimestampMs ||
        timestampMs - channel.lastValidTimestampMs > maxGapMs)
    ) {
      channel.strikeFilter.reset();
      channel.visualFilter.reset();
    }

    channel.lastValidTimestampMs = timestampMs;
    sample.quality = quality;

    channel.strikeFilter.filterInto(
      sample.rawLocal.x,
      sample.rawLocal.y,
      sample.rawLocal.z,
      timestampMs,
      sample.strikeLocal,
    );
    channel.visualFilter.filterInto(
      sample.rawLocal.x,
      sample.rawLocal.y,
      sample.rawLocal.z,
      timestampMs,
      sample.visualLocal,
    );
    sample.skinDistanceMeters = sample.visualLocal.y - this.halfLengthMeters;

    return sample;
  }

  sampleXrHand(
    handedness: Handedness,
    frame: XRFrame | null,
    referenceSpace: XRReferenceSpace | null,
    inputSource: XRInputSource | null,
    invDrumWorldMatrixElements: ArrayLike<number>,
    timestampMs: number,
  ): Readonly<HandSample> {
    const channel = this.channels[handedness];
    if (frame === null || referenceSpace === null || inputSource?.hand == null) {
      channel.jointsInput.wrist = null;
      channel.jointsInput.middleFingerMetacarpal = null;
      channel.jointsInput.indexFingerTip = null;
      return this.sampleHandFromJoints(
        handedness,
        channel.jointsInput,
        invDrumWorldMatrixElements,
        timestampMs,
      );
    }

    const hand = inputSource.hand;
    if (this.config.strike.strikePointMode === 'index-finger-tip') {
      channel.jointsInput.wrist = null;
      channel.jointsInput.middleFingerMetacarpal = null;
      channel.jointsInput.indexFingerTip = readJointIntoSample(
        frame,
        hand,
        this.config.handTracking.indexTipJointName,
        referenceSpace,
        channel.indexTipSample,
      );
    } else {
      channel.jointsInput.wrist = readJointIntoSample(
        frame,
        hand,
        this.config.handTracking.wristJointName,
        referenceSpace,
        channel.wristSample,
      );
      channel.jointsInput.middleFingerMetacarpal = readJointIntoSample(
        frame,
        hand,
        this.config.handTracking.palmMetacarpalJointName,
        referenceSpace,
        channel.metacarpalSample,
      );
      channel.jointsInput.indexFingerTip = null;
    }

    return this.sampleHandFromJoints(
      handedness,
      channel.jointsInput,
      invDrumWorldMatrixElements,
      timestampMs,
    );
  }
}
