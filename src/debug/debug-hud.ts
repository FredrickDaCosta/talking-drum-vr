import type { Handedness } from '../app/config.js';
import type { HandTrackingQuality } from '../input/hand-tracker.js';
import type { PitchHandState } from '../input/left-hand-pitch.js';

export interface DebugHudTelemetry {
  handedness: Handedness;
  handState: HandTrackingQuality;
  skinDistanceMeters: number;
  strikeCount: number;
  lastStrikeSpeedMps: number;
  lastStrikeRadialMeters: number;
}

export interface DebugHudAudioProbe {
  contextState: string;
  /** Cumulative voices started since load. */
  voicesStartedCount: number;
  /** Voices currently sounding. */
  activeVoices: number;
  lastSoftwarePipelineMs: number;
  /** Largest software-pipeline time in the last 5 s (NaN if no strike). */
  maxPipelineMs5s: number;
  /** Largest interval between StrikeSystem frame entries in the last 5 s. */
  maxFrameGapMs5s: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  skipped: {
    noContext: number;
    contextNotRunning: number;
    bufferNotReady: number;
    invalidVelocity: number;
  };
}

/** Lesson state published by LessonSystem (also on window.__talkingDrumLesson). */
export interface DebugHudLessonProbe {
  phase: string;
  level: number;
  phraseId: string;
  attempt: number;
  maxTries: number;
  /** 'none' | 'correct' | 'wrong' | 'incomplete' */
  lastResult: string;
  totalStars: number;
  maxStars: number;
}

/** Debug-only lesson line: state, level, phrase id, attempt, last result, stars. */
export function formatLessonProbe(p: DebugHudLessonProbe): string {
  return `lesson: ${p.phase} | level ${p.level} | phrase ${p.phraseId} | try ${p.attempt}/${p.maxTries} | last ${p.lastResult} | stars ${p.totalStars}/${p.maxStars}`;
}

export const AUDIO_PROBE_LABEL = 'software + audio buffer estimate';

function formatMs(ms: number, digits: number): string {
  return Number.isFinite(ms) ? `${ms.toFixed(digits)} ms` : 'n/a';
}

/**
 * Debug-only latency line. `pipeline` is performance.now() at play() minus performance.now() at
 * StrikeSystem frame entry; `max frame gap` is the longest interval between frame entries (strike
 * detection is per frame, so a long frame delays detection); `base`/`out` are
 * AudioContext.baseLatency/outputLatency. None of these measure hand-tracking or end-to-end
 * motion-to-sound latency (Quest-only, UNVERIFIED).
 */
export function formatAudioProbe(probe: DebugHudAudioProbe): string {
  const s = probe.skipped;
  return (
    `${AUDIO_PROBE_LABEL} (not tracking / end-to-end latency): ` +
    `pipeline ${formatMs(probe.lastSoftwarePipelineMs, 2)} | ` +
    `max pipeline (5 s) ${formatMs(probe.maxPipelineMs5s, 2)} | ` +
    `max frame gap (5 s) ${formatMs(probe.maxFrameGapMs5s, 1)} | ` +
    `base ${formatMs(probe.baseLatencyMs, 1)} | out ${formatMs(probe.outputLatencyMs, 1)} | ` +
    `audio ${probe.contextState} | voices started ${probe.voicesStartedCount} | active ${probe.activeVoices} | ` +
    `skipped no-context ${s.noContext} / not-running ${s.contextNotRunning} / no-buffer ${s.bufferNotReady} / invalid ${s.invalidVelocity}`
  );
}

function fixed(v: number, digits: number): string {
  return Number.isFinite(v) ? v.toFixed(digits) : 'n/a';
}

/** Debug-only pitch-hand line: tracking, squeeze, band, pitch ratio, calibration, last latched strike. */
export function formatPitchProbe(p: PitchHandState): string {
  const calib =
    p.calibration === 'done'
      ? `calib done (open ${fixed(p.calibrationOpenCurl, 2)} / fist ${fixed(p.calibrationFistCurl, 2)})`
      : p.calibration === 'failed'
        ? `calib failed: ${p.calibrationFailureReason} (defaults)`
        : `calib ${p.calibration}`;
  const last =
    p.latchedBand === 'none'
      ? 'none'
      : `${p.latchedBand} ${fixed(p.latchedPitchRatio, 2)} (squeeze ${fixed(p.latchedSqueeze, 2)}, ${p.latchedTracking})`;
  return `pitch hand(${p.hand}): ${p.tracking} | squeeze ${fixed(p.squeeze, 2)} (curl ${fixed(p.rawCurl, 2)}) | band ${p.band} | pitch ${fixed(p.pitchRatio, 2)} | ${calib} | last strike ${last}`;
}

function formatSignedMeters(meters: number): string {
  if (!Number.isFinite(meters)) {
    return 'n/a';
  }
  const sign = meters >= 0 ? '+' : '';
  return `${sign}${meters.toFixed(3)}m`;
}

/**
 * Debug HUD activated via `?debug=1`.
 * Line 1: active hand tracking state (TRACKED, EMULATED, UNTRACKED), signed distance
 * to the top drumhead skin plane, strike count, last strike speed, and radial position.
 * Line 2: the software + audio buffer latency estimate (see formatAudioProbe).
 * Lines 3 and 4: the pitch hand (formatPitchProbe) and the lesson state (formatLessonProbe).
 * Throttles DOM writes while immediately flushing discrete state or strike count changes.
 */
export class DebugHud {
  /** The mounted HUD, so other systems (DrumAudioSystem) can add their debug line. */
  static active: DebugHud | null = null;

  private element: HTMLDivElement | null = null;
  private mainLine: HTMLDivElement | null = null;
  private audioLine: HTMLDivElement | null = null;
  private lastAudioText = '';
  private pitchLine: HTMLDivElement | null = null;
  private lastPitchText = '';
  private lessonLine: HTMLDivElement | null = null;
  private lastLessonText = '';
  private readonly throttleIntervalMs: number;
  private lastWriteTimestampMs = -Infinity;
  private lastRenderedStrikeCount = -1;
  private lastRenderedHandState: HandTrackingQuality | null = null;
  private lastText = '';

  constructor(throttleIntervalMs = 80) {
    this.throttleIntervalMs = throttleIntervalMs;
  }

  mount(parent: HTMLElement = document.body): void {
    if (this.element !== null) {
      return;
    }
    const existing = document.getElementById('xr-debug-hud') as HTMLDivElement | null;
    if (existing !== null) {
      existing.remove();
    }
    const el = document.createElement('div');
    el.id = 'xr-debug-hud';
    el.dataset.testid = 'debug-hud';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Debug HUD');
    el.style.cssText = [
      'position:fixed',
      'bottom:12px',
      'right:12px',
      'z-index:9999',
      'padding:8px 12px',
      'border-radius:6px',
      'background:rgba(14,17,22,0.85)',
      'border:1px solid rgba(88,166,255,0.35)',
      'color:#c9d1d9',
      'font:500 12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'pointer-events:none',
      'user-select:none',
    ].join(';');
    const mainLine = document.createElement('div');
    mainLine.dataset.testid = 'debug-hud-main';
    const audioLine = document.createElement('div');
    audioLine.dataset.testid = 'debug-hud-audio';
    const pitchLine = document.createElement('div');
    pitchLine.dataset.testid = 'debug-hud-pitch';
    const lessonLine = document.createElement('div');
    lessonLine.dataset.testid = 'debug-hud-lesson';
    el.append(mainLine, audioLine, pitchLine, lessonLine);
    this.pitchLine = pitchLine;
    this.lessonLine = lessonLine;
    parent.appendChild(el);
    this.element = el;
    this.mainLine = mainLine;
    this.audioLine = audioLine;
    DebugHud.active = this;
    this.updateTelemetry(
      {
        handedness: 'right',
        handState: 'UNTRACKED',
        skinDistanceMeters: Number.NaN,
        strikeCount: 0,
        lastStrikeSpeedMps: 0,
        lastStrikeRadialMeters: 0,
      },
      0,
      true,
    );
  }

  updateTelemetry(telemetry: DebugHudTelemetry, timestampMs: number, forceFlush = false): void {
    if (this.element === null) {
      return;
    }

    const discreteChange =
      forceFlush ||
      telemetry.strikeCount !== this.lastRenderedStrikeCount ||
      telemetry.handState !== this.lastRenderedHandState;

    if (!discreteChange && timestampMs - this.lastWriteTimestampMs < this.throttleIntervalMs) {
      return;
    }

    const skinText = formatSignedMeters(telemetry.skinDistanceMeters);
    const speedText = `${telemetry.lastStrikeSpeedMps.toFixed(2)}m/s`;
    const radialText = `${telemetry.lastStrikeRadialMeters.toFixed(3)}m`;
    const nextText = `DEBUG HUD | hand(${telemetry.handedness}): ${telemetry.handState} | skin: ${skinText} | strikes: ${telemetry.strikeCount} | speed: ${speedText} | radial: ${radialText}`;

    if (nextText !== this.lastText) {
      if (this.mainLine !== null) {
        this.mainLine.textContent = nextText;
      }
      this.element.dataset.handState = telemetry.handState;
      this.element.dataset.strikeCount = String(telemetry.strikeCount);
      this.element.dataset.lastSpeed = telemetry.lastStrikeSpeedMps.toFixed(3);
      this.element.dataset.lastRadial = telemetry.lastStrikeRadialMeters.toFixed(3);
      this.element.dataset.skinDistance = skinText;
      this.lastText = nextText;
    }

    this.lastWriteTimestampMs = timestampMs;
    this.lastRenderedStrikeCount = telemetry.strikeCount;
    this.lastRenderedHandState = telemetry.handState;
  }

  updatePitchProbe(state: PitchHandState): void {
    if (this.pitchLine === null) {
      return;
    }
    const nextText = formatPitchProbe(state);
    if (nextText !== this.lastPitchText) {
      this.pitchLine.textContent = nextText;
      this.lastPitchText = nextText;
    }
  }

  updateLessonProbe(probe: DebugHudLessonProbe): void {
    if (this.lessonLine === null) {
      return;
    }
    const nextText = formatLessonProbe(probe);
    if (nextText !== this.lastLessonText) {
      this.lessonLine.textContent = nextText;
      this.lastLessonText = nextText;
    }
  }

  updateAudioProbe(probe: DebugHudAudioProbe): void {
    if (this.audioLine === null) {
      return;
    }
    const nextText = formatAudioProbe(probe);
    if (nextText !== this.lastAudioText) {
      this.audioLine.textContent = nextText;
      this.lastAudioText = nextText;
    }
  }

  setStatus(statusText: string): void {
    if (this.mainLine !== null && statusText !== this.lastText) {
      this.mainLine.textContent = statusText;
      this.lastText = statusText;
    }
  }

  dispose(): void {
    if (this.element !== null) {
      this.element.remove();
      this.element = null;
      this.mainLine = null;
      this.audioLine = null;
      this.pitchLine = null;
      this.lastPitchText = '';
      this.lessonLine = null;
      this.lastLessonText = '';
      this.lastText = '';
      this.lastAudioText = '';
      if (DebugHud.active === this) {
        DebugHud.active = null;
      }
      this.lastRenderedStrikeCount = -1;
      this.lastRenderedHandState = null;
    }
  }
}
