import { APP_CONFIG, type SqueezeConfig } from '../app/config.js';

export type CalibrationPhase =
  'not-started' | 'skipped' | 'waiting-for-hand' | 'open' | 'fist' | 'done' | 'failed';

export function calibrationOpenPrompt(hand: 'left' | 'right' = 'left'): string {
  return `Calibration 1/2: open your ${hand.toUpperCase()} hand wide and hold it still.`;
}
export function calibrationFistPrompt(hand: 'left' | 'right' = 'left'): string {
  return `Calibration 2/2: now make a tight FIST with your ${hand.toUpperCase()} hand.`;
}
export function calibrationDoneMessage(hand: 'left' | 'right' = 'left'): string {
  return `Calibrated. Squeeze your ${hand} hand to change the drum’s pitch.`;
}
export const CALIBRATION_FAILED_MESSAGE = 'Calibration unclear, so default hand settings are used.';

/** Capacity per step; covers 2 s at up to ~250 Hz. */
const SAMPLE_CAPACITY = 512;

/** Median of the first `count` values; sorts `scratch` in place (no allocation beyond the view). */
function medianOf(values: Float64Array, count: number): number {
  const view = values.subarray(0, count);
  view.sort();
  const mid = count >> 1;
  return count % 2 === 1 ? view[mid] : (view[mid - 1] + view[mid]) / 2;
}

/**
 * Guided open/fist calibration for the squeeze hand. Pure and time-driven: call `update(nowMs,
 * rawCurl)` every frame (rawCurl NaN when the hand is not usable). Captures the median curl of each
 * step after a settle period (robust to outliers), then sanity-checks the result. On failure (or
 * when skipped) the config defaults are kept.
 */
export class SqueezeCalibration {
  phase: CalibrationPhase = 'not-started';
  openCurl: number;
  fistCurl: number;
  failureReason = '';
  /** Median captured for each step (NaN until captured), kept for the debug HUD. */
  capturedOpen = Number.NaN;
  capturedFist = Number.NaN;

  private readonly config: SqueezeConfig;
  readonly hand: 'left' | 'right';
  private readonly openPrompt: string;
  private readonly fistPrompt: string;
  private readonly donePrompt: string;
  private readonly samples = new Float64Array(SAMPLE_CAPACITY);
  private sampleCount = 0;
  private phaseStartMs = 0;
  private resultUntilMs = -Infinity;

  constructor(config: SqueezeConfig = APP_CONFIG.squeeze, hand: 'left' | 'right' = 'left') {
    this.config = config;
    this.hand = hand;
    this.openPrompt = calibrationOpenPrompt(hand);
    this.fistPrompt = calibrationFistPrompt(hand);
    this.donePrompt = calibrationDoneMessage(hand);
    this.openCurl = config.defaultOpenCurl;
    this.fistCurl = config.defaultFistCurl;
  }

  /** Begin (or skip) calibration. Starting again after `done` keeps the earlier result. */
  start(nowMs: number, skip: boolean): void {
    if (skip) {
      this.phase = 'skipped';
      return;
    }
    if (this.phase === 'done') {
      return;
    }
    this.phase = 'waiting-for-hand';
    this.phaseStartMs = nowMs;
    this.sampleCount = 0;
  }

  /** Abort an in-progress calibration (e.g. the XR session ended); it restarts next session. */
  cancel(): void {
    if (this.phase === 'waiting-for-hand' || this.phase === 'open' || this.phase === 'fist') {
      this.phase = 'not-started';
    }
    this.resultUntilMs = -Infinity;
  }

  get inProgress(): boolean {
    return this.phase === 'open' || this.phase === 'fist';
  }

  update(nowMs: number, rawCurl: number): void {
    switch (this.phase) {
      case 'waiting-for-hand':
        if (Number.isFinite(rawCurl)) {
          this.beginStep('open', nowMs);
        }
        return;
      case 'open':
        this.collect(nowMs, rawCurl);
        if (nowMs - this.phaseStartMs >= this.config.calibrationOpenMs) {
          this.capturedOpen = this.finishStep();
          this.beginStep('fist', nowMs);
        }
        return;
      case 'fist':
        this.collect(nowMs, rawCurl);
        if (nowMs - this.phaseStartMs >= this.config.calibrationFistMs) {
          this.capturedFist = this.finishStep();
          this.conclude(nowMs);
        }
        return;
      default:
        return;
    }
  }

  /** On-screen prompt for the current step, or the result for a short time; null otherwise. */
  prompt(nowMs: number): string | null {
    if (this.phase === 'open') {
      return this.openPrompt;
    }
    if (this.phase === 'fist') {
      return this.fistPrompt;
    }
    if (nowMs < this.resultUntilMs) {
      return this.phase === 'done' ? this.donePrompt : CALIBRATION_FAILED_MESSAGE;
    }
    return null;
  }

  private beginStep(phase: 'open' | 'fist', nowMs: number): void {
    this.phase = phase;
    this.phaseStartMs = nowMs;
    this.sampleCount = 0;
  }

  private collect(nowMs: number, rawCurl: number): void {
    if (
      Number.isFinite(rawCurl) &&
      nowMs - this.phaseStartMs >= this.config.calibrationSettleMs &&
      this.sampleCount < SAMPLE_CAPACITY
    ) {
      this.samples[this.sampleCount] = rawCurl;
      this.sampleCount += 1;
    }
  }

  private finishStep(): number {
    if (this.sampleCount < this.config.minCalibrationSamples) {
      return Number.NaN;
    }
    return medianOf(this.samples, this.sampleCount);
  }

  private conclude(nowMs: number): void {
    const c = this.config;
    const open = this.capturedOpen;
    const fist = this.capturedFist;
    let reason = '';
    if (!Number.isFinite(open) || !Number.isFinite(fist)) {
      reason = 'too few samples (hand not tracked or very low frame rate)';
    } else if (
      open < c.minPlausibleCurl ||
      open > c.maxPlausibleCurl ||
      fist < c.minPlausibleCurl ||
      fist > c.maxPlausibleCurl
    ) {
      reason = 'implausible values';
    } else if (open - fist < c.minCalibrationSeparation) {
      reason = `open and fist too similar (${(open - fist).toFixed(2)} < ${c.minCalibrationSeparation})`;
    }
    this.resultUntilMs = nowMs + c.calibrationResultMessageMs;
    if (reason === '') {
      this.openCurl = open;
      this.fistCurl = fist;
      this.failureReason = '';
      this.phase = 'done';
    } else {
      this.openCurl = c.defaultOpenCurl;
      this.fistCurl = c.defaultFistCurl;
      this.failureReason = reason;
      this.phase = 'failed';
    }
  }
}
