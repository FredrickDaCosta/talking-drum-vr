import {
  BufferGeometry,
  CanvasTexture,
  createSystem,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { APP_CONFIG, type Handedness } from '../app/config.js';
import { TalkingDrum } from '../app/talking-drum-component.js';
import { drumAudio } from '../audio/audio-unlock.js';
import { pitchHand } from '../input/left-hand-pitch.js';
import { LESSON_FONT_FAMILY } from '../ui/lesson-panel-canvas.js';
import { type FrameStats, FrameStatsWindow } from './frame-stats.js';
import { DEBUG_MAX_WINDOW_MS, frameTiming } from './frame-timing.js';
import { type DebugMark, MarkLog } from './mark-log.js';
import { isInsidePanel, PanelTouch } from './panel-touch.js';
import {
  createVrDebugSnapshot,
  formatVrDebugLines,
  VR_DEBUG_LINE_COUNT,
  type VrDebugSnapshot,
} from './vr-debug-format.js';

/** Debug / test hooks (window.__talkingDrumDebugPanel), present only with ?debug=1. */
export interface VrDebugPanelHooks {
  readonly canvas: HTMLCanvasElement;
  visible: boolean;
  refreshes: number;
  touches: { left: number; right: number };
  /** Panel centre and index fingertips in reference space (= world with the identity rig). */
  readonly centre: { x: number; y: number; z: number };
  readonly tips: Record<Handedness, { x: number; y: number; z: number }>;
  /** Angle between the panel's face normal and the direction to the head (degrees; 0 = facing). */
  facingDeg: number;
  readonly head: { x: number; y: number; z: number };
  readonly lines: string[];
  readonly snapshot: VrDebugSnapshot;
  marks: () => DebugMark[];
  toggle: () => void;
  mark: () => void;
}

declare global {
  interface Window {
    __talkingDrumDebugPanel?: VrDebugPanelHooks;
  }
}

/** WebXR Hand Input `XRFrame.fillPoses` (bulk, allocation-free); missing from TS DOM types. */
interface XRFrameFillPoses {
  fillPoses?: (spaces: XRSpace[], baseSpace: XRSpace, transforms: Float32Array) => boolean;
}

const HANDS: readonly Handedness[] = ['left', 'right'];

/**
 * In-VR debug panel (registered only with ?debug=1, so it does not exist otherwise). Shows the key
 * numbers from the flat-page HUD on a small canvas-texture panel low and to the right of the drum,
 * turned to face the player. Values are sampled every frame into preallocated fields and the text is
 * redrawn at `debugPanel.refreshHz` (~4 Hz).
 *
 * Hands-only controls (index fingertip touches, edge-triggered with a re-arm delay):
 * - RIGHT index touch: add a timestamped "mark" (ring buffer, newest two shown on the panel).
 * - LEFT index touch: hide / show the panel text (a thin outline stays so it can be found again).
 * Keyboard (desktop / emulator): `debugPanel.toggleKey` toggles, `debugPanel.markKey` marks.
 */
export class VrDebugPanelSystem extends createSystem({
  drums: { required: [TalkingDrum] },
}) {
  private readonly cfg = APP_CONFIG.debugPanel;
  private readonly root = new Group();
  private mesh!: Mesh;
  private canvas!: HTMLCanvasElement;
  private ctx2d!: CanvasRenderingContext2D;
  private texture!: CanvasTexture;
  private hooks!: VrDebugPanelHooks;

  private readonly snapshot = createVrDebugSnapshot();
  private readonly lines: string[] = new Array<string>(VR_DEBUG_LINE_COUNT).fill('');
  private readonly frames = new FrameStatsWindow(DEBUG_MAX_WINDOW_MS, 1024);
  private readonly frameStats: FrameStats = {
    avgMs: Number.NaN,
    fps: Number.NaN,
    maxMs: 0,
    count: 0,
  };
  private readonly marks = new MarkLog(APP_CONFIG.debugPanel.markCapacity);
  private readonly touchLeft = new PanelTouch(APP_CONFIG.debugPanel.touchRearmMs);
  private readonly touchRight = new PanelTouch(APP_CONFIG.debugPanel.touchRearmMs);
  private lastFrameMs = Number.NaN;
  private lastRefreshMs = -Infinity;

  private readonly scratch = new Vector3();
  private readonly headPos = new Vector3();
  private readonly toPanelLocal = new Matrix4();
  private readonly tip = new Vector3();
  private readonly tipMatrices = new Float32Array(16);
  private readonly tipSpaces: Record<Handedness, XRSpace[]> = { left: [], right: [] };
  private readonly cachedHands: Record<Handedness, XRHand | null> = { left: null, right: null };

  init(): void {
    const cfg = this.cfg;
    const canvas = document.createElement('canvas');
    canvas.width = cfg.canvasWidthPx;
    canvas.height = cfg.canvasHeightPx;
    const ctx2d = canvas.getContext('2d');
    if (ctx2d === null) {
      return;
    }
    this.canvas = canvas;
    this.ctx2d = ctx2d;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.mesh = new Mesh(
      new PlaneGeometry(cfg.widthMeters, cfg.heightMeters),
      new MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false }),
    );
    this.mesh.name = 'vr-debug-panel';
    this.mesh.visible = cfg.visibleAtStart;
    const w = cfg.widthMeters / 2;
    const h = cfg.heightMeters / 2;
    const outline = new LineLoop(
      new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute([-w, -h, 0, w, -h, 0, w, h, 0, -w, h, 0], 3),
      ),
      new LineBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.6 }),
    );
    outline.name = 'vr-debug-panel-outline';
    this.root.name = 'vr-debug-panel-root';
    this.root.add(this.mesh, outline);
    this.world.createTransformEntity(this.root);

    this.hooks = {
      canvas,
      visible: this.mesh.visible,
      refreshes: 0,
      touches: { left: 0, right: 0 },
      centre: { x: 0, y: 0, z: 0 },
      tips: {
        left: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
        right: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
      },
      facingDeg: Number.NaN,
      head: { x: 0, y: 0, z: 0 },
      lines: this.lines,
      snapshot: this.snapshot,
      marks: () => this.marks.toArray(),
      toggle: () => this.toggle(),
      mark: () => this.addMark(performance.now()),
    };
    window.__talkingDrumDebugPanel = this.hooks;

    const onKey = (event: KeyboardEvent): void => {
      if (event.code === cfg.toggleKey) {
        this.toggle();
      } else if (event.code === cfg.markKey) {
        this.addMark(performance.now());
      }
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => {
      window.removeEventListener('keydown', onKey);
      if (window.__talkingDrumDebugPanel === this.hooks) {
        delete window.__talkingDrumDebugPanel;
      }
    });
    this.refresh(performance.now());
  }

  update(): void {
    if (this.mesh === undefined) {
      return;
    }
    const nowMs = performance.now();
    if (Number.isFinite(this.lastFrameMs)) {
      this.frames.push(nowMs, nowMs - this.lastFrameMs);
    }
    this.lastFrameMs = nowMs;

    this.placeFacingHead();
    if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) {
      this.checkTouches(nowMs);
    }
    if (nowMs - this.lastRefreshMs >= 1000 / this.cfg.refreshHz) {
      this.refresh(nowMs);
    }
  }

  private toggle(): void {
    this.mesh.visible = !this.mesh.visible;
    this.hooks.visible = this.mesh.visible;
  }

  private addMark(nowMs: number): void {
    const rt = window.__talkingDrumRuntime;
    const lesson = window.__talkingDrumLesson;
    this.marks.push(
      nowMs / 1000,
      rt?.strikeCount ?? 0,
      rt?.lastStrikeSpeedMps ?? 0,
      rt?.lastStrikeRadialMeters ?? 0,
      lesson?.phase ?? '',
      lesson?.phraseId ?? '',
    );
    this.refresh(nowMs);
  }

  /** Follows the drum (offset in world axes) and turns the panel face toward the player's head. */
  private placeFacingHead(): void {
    let drum = null;
    for (const entity of this.queries.drums.entities) {
      if (entity.object3D != null) {
        drum = entity.object3D;
        break;
      }
    }
    if (drum == null) {
      return;
    }
    drum.updateWorldMatrix(true, false);
    const offset = this.cfg.offsetMeters;
    this.scratch.setFromMatrixPosition(drum.matrixWorld);
    this.scratch.x += offset[0];
    this.scratch.y += offset[1];
    this.scratch.z += offset[2];
    const parent = this.root.parent;
    if (parent != null) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(this.scratch);
    }
    this.root.position.copy(this.scratch);
    this.root.updateWorldMatrix(true, false);
    this.scratch.setFromMatrixPosition(this.root.matrixWorld);
    this.hooks.centre.x = this.scratch.x;
    this.hooks.centre.y = this.scratch.y;
    this.hooks.centre.z = this.scratch.z;
    this.player.head.updateWorldMatrix(true, false);
    this.headPos.setFromMatrixPosition(this.player.head.matrixWorld);
    this.root.lookAt(this.headPos);
    this.hooks.head.x = this.headPos.x;
    this.hooks.head.y = this.headPos.y;
    this.hooks.head.z = this.headPos.z;
  }

  /** Index fingertips (reference space -> panel local) against the panel box. */
  private checkTouches(nowMs: number): void {
    const frame = this.world.xrFrame as (XRFrame & XRFrameFillPoses) | undefined;
    const refSpace = this.world.xrReferenceSpace;
    const sources = this.world.xrSession?.inputSources;
    if (
      frame == null ||
      refSpace == null ||
      sources == null ||
      typeof frame.fillPoses !== 'function'
    ) {
      return;
    }
    this.root.updateWorldMatrix(true, false);
    this.player.updateWorldMatrix(true, false);
    this.toPanelLocal.copy(this.root.matrixWorld).invert().multiply(this.player.matrixWorld);

    for (const hand of HANDS) {
      let inside = false;
      const xrHand = this.findHand(sources, hand);
      if (xrHand !== null && this.cacheTipSpace(hand, xrHand)) {
        if (frame.fillPoses(this.tipSpaces[hand], refSpace, this.tipMatrices)) {
          const m = this.tipMatrices;
          const tipOut = this.hooks.tips[hand];
          tipOut.x = m[12];
          tipOut.y = m[13];
          tipOut.z = m[14];
          this.tip.set(m[12], m[13], m[14]).applyMatrix4(this.toPanelLocal);
          inside = isInsidePanel(
            this.tip.x,
            this.tip.y,
            this.tip.z,
            this.cfg.widthMeters,
            this.cfg.heightMeters,
            this.cfg.touchDepthMeters,
          );
        }
      }
      const touch = hand === 'left' ? this.touchLeft : this.touchRight;
      if (touch.update(nowMs, inside)) {
        this.hooks.touches[hand] += 1;
        if (hand === 'left') {
          this.toggle();
        } else {
          this.addMark(nowMs);
        }
      }
    }
  }

  private findHand(sources: XRInputSourceArray, hand: Handedness): XRHand | null {
    for (let i = 0; i < sources.length; i += 1) {
      const source = sources[i];
      if (source.handedness === hand && source.hand != null) {
        return source.hand;
      }
    }
    return null;
  }

  /** Caches the index-tip joint space per hand; allocates only when the XRHand object changes. */
  private cacheTipSpace(hand: Handedness, xrHand: XRHand): boolean {
    if (this.cachedHands[hand] !== xrHand) {
      this.cachedHands[hand] = xrHand;
      const space = xrHand.get('index-finger-tip');
      this.tipSpaces[hand] = space == null ? [] : [space];
    }
    return this.tipSpaces[hand].length === 1;
  }

  /** Samples every source into the preallocated snapshot, formats the lines and redraws (~4 Hz). */
  private refresh(nowMs: number): void {
    this.lastRefreshMs = nowMs;
    if (this.root.parent != null) {
      this.root.updateWorldMatrix(true, false);
      const e = this.root.matrixWorld.elements;
      this.tip.set(e[8], e[9], e[10]).normalize(); // panel +Z (face normal) in world
      this.scratch.setFromMatrixPosition(this.root.matrixWorld);
      this.headPos
        .setFromMatrixPosition(this.player.head.matrixWorld)
        .sub(this.scratch)
        .normalize();
      this.hooks.facingDeg = (Math.acos(Math.min(1, this.tip.dot(this.headPos))) * 180) / Math.PI;
    }
    const s = this.snapshot;
    this.frames.statsInto(nowMs, this.frameStats);
    s.fps = this.frameStats.fps;
    s.frameAvgMs = this.frameStats.avgMs;
    s.frameMaxMs = this.frameStats.maxMs;
    s.maxFrameGapMs = frameTiming.maxFrameGapMs(nowMs);
    const rt = window.__talkingDrumRuntime;
    if (rt !== undefined) {
      s.strikeCount = rt.strikeCount;
      s.lastSpeedMps = rt.lastStrikeSpeedMps;
      s.lastRadialMeters = rt.lastStrikeRadialMeters;
      s.rightHand = rt.handState;
    }
    drumAudio.refreshContextDiagnostics();
    const a = drumAudio.diagnostics;
    s.pipelineMs = a.lastSoftwarePipelineMs;
    s.baseLatencyMs = a.baseLatencyMs;
    s.outputLatencyMs = a.outputLatencyMs;
    s.audioState = a.contextState;
    s.skippedNoContext = a.skipped.noContext;
    s.skippedNotRunning = a.skipped.contextNotRunning;
    s.skippedNoBuffer = a.skipped.bufferNotReady;
    s.skippedInvalid = a.skipped.invalidVelocity;
    s.leftHand = pitchHand.tracking;
    s.squeeze = pitchHand.squeeze;
    s.band = pitchHand.band;
    s.pitchRatio = pitchHand.pitchRatio;
    s.calibration = pitchHand.calibration;
    s.openCurl = pitchHand.calibrationOpenCurl;
    s.fistCurl = pitchHand.calibrationFistCurl;
    const lesson = window.__talkingDrumLesson;
    if (lesson !== undefined) {
      s.lessonPhase = lesson.phase;
      s.lessonLevel = lesson.level;
      s.phraseId = lesson.phraseId;
    }
    formatVrDebugLines(s, this.marks, this.lines);
    this.draw();
    this.hooks.refreshes += 1;
  }

  private draw(): void {
    const ctx = this.ctx2d;
    const { width, height } = this.canvas;
    const px = this.cfg.textPx;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 12, 18, 0.88)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.7)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const step = (height - 24) / (this.lines.length + 0.4);
    for (let i = 0; i < this.lines.length; i += 1) {
      const line = this.lines[i];
      const bar = line.indexOf('|');
      const y = 12 + step * (i + 1);
      ctx.font = `700 ${px}px ${LESSON_FONT_FAMILY}, sans-serif`;
      ctx.fillStyle = '#58a6ff';
      ctx.fillText(line.slice(0, bar), 20, y);
      ctx.font = `400 ${px}px ${LESSON_FONT_FAMILY}, sans-serif`;
      ctx.fillStyle = i >= 10 ? '#f0b429' : '#e6edf3';
      ctx.fillText(line.slice(bar + 1), 230, y, width - 250);
    }
    this.texture.needsUpdate = true;
  }
}
