import type { Handedness } from '../app/config.js';
import type { HandTrackingQuality } from '../input/hand-tracker.js';

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
 * Throttles DOM writes while immediately flushing discrete state or strike count changes.
 */
export class DebugHud {
  /** The mounted HUD, so other systems (DrumAudioSystem) can add their debug line. */
  static active: DebugHud | null = null;

  private element: HTMLDivElement | null = null;
  private mainLine: HTMLDivElement | null = null;
  private audioLine: HTMLDivElement | null = null;
  private lastAudioText = '';
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
    el.append(mainLine, audioLine);
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
