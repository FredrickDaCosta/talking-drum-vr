import {
  CanvasTexture,
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { APP_CONFIG, type PitchBand } from '../app/config.js';
import { getAppFlags } from '../app/flags.js';
import { TalkingDrum } from '../app/talking-drum-component.js';
import { drumAudio } from '../audio/audio-unlock.js';
import { LESSONS } from '../content/lessons.js';
import { DebugHud, type DebugHudLessonProbe } from '../debug/debug-hud.js';
import { pitchHand } from '../input/left-hand-pitch.js';
import {
  drawFontSpecimen,
  drawLessonPanel,
  LESSON_FONT_FAMILY,
  LESSON_FONT_FILES,
} from '../ui/lesson-panel-canvas.js';
import { statusChannel } from '../ui/status-channel.js';
import { StrikeSystem } from './strike-system.js';
import { ladderOverride } from './ladder-override.js';
import {
  buildSessionPlan,
  createLessonState,
  currentPhrase,
  type LessonEvent,
  type LessonState,
  maxStars,
  reduceLesson,
  type SessionPlan,
  totalStars,
} from './lesson-machine.js';
import { buildLessonView } from './lesson-view.js';

/** Debug / test view of the lesson (window.__talkingDrumLesson). */
export interface LessonDiagnostics extends DebugHudLessonProbe {
  version: number;
  feedback: string;
  /** Bands struck in the current attempt, e.g. "M,H". */
  strikes: string;
  stars: Record<string, number>;
  demoReason: string;
  demosStarted: number;
  demoVoicesScheduled: number;
  /** Current demo syllable (-1 outside a demo). */
  demoIndex: number;
  /** Phase sequence so far (capped), for tests. */
  history: string[];
  panelRedraws: number;
  fontStatus: string;
}

/** Debug only (?debug=1): the panel canvas and a font-specimen hook for the diacritics check. */
export interface LessonPanelDebug {
  canvas: HTMLCanvasElement;
  fontStatus: () => string;
  drawSpecimen: (lines: string[]) => string;
}

declare global {
  interface Window {
    __talkingDrumLesson?: LessonDiagnostics;
    __talkingDrumLessonPanel?: LessonPanelDebug;
  }
}

const HISTORY_LIMIT = 200;
const CALIBRATION_FINISHED = new Set(['done', 'failed', 'skipped']);

/**
 * Thin host for the pure lesson reducer (lesson-machine.ts): feeds it strikes (with the band
 * latched on the strike frame), a per-frame TICK and calibration completion; runs its PLAY_DEMO
 * effects on the audio clock (DrumAudio.playAt); and draws the in-world lesson panel when the view
 * changes. Registered after DrumAudioSystem, so its strike listener sees this strike's latch.
 */
export class LessonSystem extends createSystem({
  drums: { required: [TalkingDrum] },
}) {
  private plan!: SessionPlan;
  private state!: LessonState;
  private startLevelIndex = 0;
  private startPhraseIndex = 0;
  private debugEnabled = false;
  private readonly tick: { type: 'TICK'; timeMs: number } = { type: 'TICK', timeMs: 0 };
  private readonly calibrationReady: { type: 'CALIBRATION_READY'; timeMs: number } = {
    type: 'CALIBRATION_READY',
    timeMs: 0,
  };
  private demoCtxStartSec = Number.NaN;
  private demoIndex = -1;
  private shownPrompt: string | null = null;
  private dirty = true;
  private fontStatus = 'not-loaded';

  private readonly root = new Group();
  private readonly scratch = new Vector3();
  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private texture: CanvasTexture | null = null;

  private readonly diag: LessonDiagnostics = {
    phase: 'TITLE',
    level: 0,
    phraseId: '',
    attempt: 1,
    maxTries: APP_CONFIG.lesson.maxTries,
    lastResult: 'none',
    totalStars: 0,
    maxStars: 0,
    version: 0,
    feedback: 'none',
    strikes: '',
    stars: {},
    demoReason: 'none',
    demosStarted: 0,
    demoVoicesScheduled: 0,
    demoIndex: -1,
    history: [],
    panelRedraws: 0,
    fontStatus: 'not-loaded',
  };

  init(): void {
    const flags = getAppFlags();
    this.debugEnabled = flags.debug;
    const { plan, levelIndex, phraseIndex } = buildSessionPlan(
      LESSONS,
      APP_CONFIG.lesson,
      flags.lesson,
    );
    if (flags.lesson !== undefined && !LESSONS.some((e) => e.id === flags.lesson)) {
      console.warn(`[Lesson] Unknown ?lesson=${flags.lesson}; starting from the beginning.`);
    }
    this.plan = plan;
    this.startLevelIndex = levelIndex;
    this.startPhraseIndex = phraseIndex;
    this.state = createLessonState(levelIndex, phraseIndex, performance.now());
    this.diag.maxStars = maxStars(plan);
    this.publish();

    this.buildPanel();
    this.loadFonts();

    const unsubscribeStrike = StrikeSystem.onStrike(() => {
      // DrumAudioSystem's listener ran first and latched this strike's band.
      const latched = pitchHand.latchedBand;
      const band: PitchBand = latched === 'none' ? pitchHand.band : latched;
      this.dispatch({ type: 'STRIKE', band, timeMs: performance.now() });
    });
    // Leaving XR returns to the title; calibration is kept for the page session.
    const unsubscribeVisibility = this.world.visibilityState.subscribe((visibility) => {
      if (visibility === VisibilityState.NonImmersive && this.state.phase !== 'TITLE') {
        this.state = createLessonState(
          this.startLevelIndex,
          this.startPhraseIndex,
          performance.now(),
        );
        this.onTransition();
      }
    });
    this.cleanupFuncs.push(unsubscribeStrike, unsubscribeVisibility, () => {
      ladderOverride.active = false;
    });
    if (typeof window !== 'undefined') {
      window.__talkingDrumLesson = this.diag;
    }
  }

  update(): void {
    this.followDrum();

    const nowMs = performance.now();
    if (this.state.phase === 'CALIBRATION' && CALIBRATION_FINISHED.has(pitchHand.calibration)) {
      this.calibrationReady.timeMs = nowMs;
      this.dispatch(this.calibrationReady);
    }
    this.tick.timeMs = nowMs;
    this.dispatch(this.tick);

    this.updateDemoIndex(nowMs);

    const prompt = statusChannel.calibrationPrompt;
    if (prompt !== this.shownPrompt) {
      this.shownPrompt = prompt;
      if (this.state.phase === 'TITLE' || this.state.phase === 'CALIBRATION') {
        this.dirty = true;
      }
    }
    if (this.dirty) {
      this.redraw();
    }
  }

  private dispatch(event: LessonEvent): void {
    const next = reduceLesson(this.state, event, this.plan, APP_CONFIG.lesson);
    if (next !== this.state) {
      this.state = next;
      this.onTransition();
    }
  }

  private onTransition(): void {
    const state = this.state;
    for (const effect of state.effects) {
      if (effect.type === 'PLAY_DEMO') {
        this.playDemo(effect.tones, effect.leadInMs, effect.intervalMs);
        this.diag.demoReason = effect.reason;
      }
    }
    if (state.phase !== 'DEMO') {
      this.demoCtxStartSec = Number.NaN;
    }
    this.dirty = true;
    this.publish();
  }

  private playDemo(tones: readonly PitchBand[], leadInMs: number, intervalMs: number): void {
    const config = APP_CONFIG.lesson;
    const ctxNow = drumAudio.currentTime;
    this.diag.demosStarted += 1;
    if (!Number.isFinite(ctxNow)) {
      this.demoCtxStartSec = Number.NaN;
      return;
    }
    this.demoCtxStartSec = ctxNow + leadInMs / 1000;
    for (let i = 0; i < tones.length; i += 1) {
      const outcome = drumAudio.playAt(this.demoCtxStartSec + (i * intervalMs) / 1000, {
        velocity: config.demoVelocityMps,
        pitchRatio: config.bandRatios[tones[i]],
      });
      if (outcome === 'played') {
        this.diag.demoVoicesScheduled += 1;
      }
    }
  }

  /** Demo syllable from the audio clock when it runs, else from performance.now(). */
  private updateDemoIndex(nowMs: number): void {
    let index = -1;
    const state = this.state;
    if (state.phase === 'DEMO') {
      const tones = currentPhrase(state, this.plan)?.tones ?? [];
      const intervalMs = APP_CONFIG.lesson.syllableIntervalMs;
      const running = drumAudio.context?.state === 'running';
      const elapsedMs =
        running && Number.isFinite(this.demoCtxStartSec)
          ? (drumAudio.currentTime - this.demoCtxStartSec) * 1000
          : nowMs - state.demoStartMs;
      const i = Math.floor(elapsedMs / intervalMs);
      if (elapsedMs >= 0 && i < tones.length) {
        index = i;
        ladderOverride.band = tones[i];
      }
    }
    ladderOverride.active = index >= 0;
    if (index !== this.demoIndex) {
      this.demoIndex = index;
      this.diag.demoIndex = index;
      this.dirty = true;
    }
  }

  private publish(): void {
    const s = this.state;
    const d = this.diag;
    const level = this.plan.levels[s.levelIndex];
    const result = s.lastResult;
    d.phase = s.phase;
    d.level = level?.level ?? 0;
    d.phraseId = currentPhrase(s, this.plan)?.id ?? '';
    d.attempt = s.attempt;
    d.lastResult =
      result === null
        ? 'none'
        : result.correct
          ? 'correct'
          : result.complete
            ? 'wrong'
            : 'incomplete';
    d.feedback = s.feedback ?? 'none';
    d.strikes = s.strikes.map((x) => x.band).join(',');
    d.stars = { ...s.stars };
    d.totalStars = totalStars(s);
    d.version = s.version;
    if (d.history[d.history.length - 1] !== s.phase && d.history.length < HISTORY_LIMIT) {
      d.history.push(s.phase);
    }
    if (this.debugEnabled) {
      DebugHud.active?.updateLessonProbe(d);
    }
  }

  private buildPanel(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const cfg = APP_CONFIG.lessonPanel;
    const canvas = document.createElement('canvas');
    canvas.width = cfg.canvasWidthPx;
    canvas.height = cfg.canvasHeightPx;
    const ctx2d = canvas.getContext('2d');
    if (ctx2d === null) {
      return;
    }
    this.canvas = canvas;
    this.ctx2d = ctx2d;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    this.texture = texture;
    const mesh = new Mesh(
      new PlaneGeometry(cfg.widthMeters, cfg.heightMeters),
      new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }),
    );
    mesh.name = 'lesson-panel';
    this.root.name = 'lesson-panel-root';
    this.root.add(mesh);
    this.world.createTransformEntity(this.root);

    if (this.debugEnabled && typeof window !== 'undefined') {
      window.__talkingDrumLessonPanel = {
        canvas,
        fontStatus: () => this.fontStatus,
        drawSpecimen: (lines: string[]) => {
          drawFontSpecimen(ctx2d, lines, canvas.width, canvas.height);
          texture.needsUpdate = true;
          return canvas.toDataURL('image/png');
        },
      };
    }
  }

  /** Same-origin font files only (no third-party requests). Redraws once they are ready. */
  private loadFonts(): void {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
      this.setFontStatus('unsupported');
      return;
    }
    const base = import.meta.env.BASE_URL;
    const loads = LESSON_FONT_FILES.map((f) => {
      const face = new FontFace(LESSON_FONT_FAMILY, `url(${base}${f.file}) format('woff2')`, {
        weight: f.weight,
        style: 'normal',
      });
      document.fonts.add(face);
      return face.load();
    });
    this.setFontStatus('loading');
    Promise.all(loads)
      .then(() => {
        this.setFontStatus('loaded');
        this.dirty = true;
      })
      .catch((error: unknown) => {
        this.setFontStatus('failed');
        this.dirty = true;
        console.warn('[Lesson] Panel font failed to load; using the system font.', error);
      });
  }

  private setFontStatus(status: string): void {
    this.fontStatus = status;
    this.diag.fontStatus = status;
  }

  private redraw(): void {
    this.dirty = false;
    if (this.ctx2d === null || this.canvas === null || this.texture === null) {
      return;
    }
    const view = buildLessonView(this.state, this.plan, {
      calibrationPrompt: this.shownPrompt,
      demoIndex: this.demoIndex,
    });
    drawLessonPanel(this.ctx2d, view, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
    this.diag.panelRedraws += 1;
  }

  private followDrum(): void {
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
    const offset = APP_CONFIG.lessonPanel.offsetMeters;
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
  }
}
