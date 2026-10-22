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

function formatSignedMeters(meters: number): string {
  if (!Number.isFinite(meters)) {
    return 'n/a';
  }
  const sign = meters >= 0 ? '+' : '';
  return `${sign}${meters.toFixed(3)}m`;
}

/**
 * Debug HUD activated via `?debug=1`.
 * Displays active hand tracking state (TRACKED, EMULATED, UNTRACKED), signed distance
 * to the top drumhead skin plane, strike count, last strike speed, and radial position.
 * Throttles DOM writes while immediately flushing discrete state or strike count changes.
 */
export class DebugHud {
  private element: HTMLDivElement | null = null;
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
      this.element = existing;
      return;
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
    parent.appendChild(el);
    this.element = el;
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
      this.element.textContent = nextText;
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

  setStatus(statusText: string): void {
    if (this.element !== null && statusText !== this.lastText) {
      this.element.textContent = statusText;
      this.lastText = statusText;
    }
  }

  dispose(): void {
    if (this.element !== null) {
      this.element.remove();
      this.element = null;
      this.lastText = '';
      this.lastRenderedStrikeCount = -1;
      this.lastRenderedHandState = null;
    }
  }
}
