import { RollingMaxWindow } from './rolling-max.js';

/** Window for the debug HUD "max ... (5 s)" readouts. */
export const DEBUG_MAX_WINDOW_MS = 5000;

/** Gaps longer than this (tab hidden, debugger pause) are not frame hitches and are ignored. */
const MAX_PLAUSIBLE_FRAME_GAP_MS = 2000;

/**
 * Records the interval between consecutive StrikeSystem frame entries (debug only). Strikes are
 * detected once per frame, so a long frame delays detection by up to its whole length, which the
 * software-pipeline figure (measured from frame entry) cannot show.
 */
export class FrameTimingProbe {
  // 1024 samples covers 5 s at up to ~200 fps.
  readonly frameGaps = new RollingMaxWindow(DEBUG_MAX_WINDOW_MS, 1024);
  private lastEntryMs = Number.NaN;

  recordFrameEntry(nowMs: number): void {
    const gap = nowMs - this.lastEntryMs;
    if (gap > 0 && gap <= MAX_PLAUSIBLE_FRAME_GAP_MS) {
      this.frameGaps.push(nowMs, gap);
    }
    this.lastEntryMs = nowMs;
  }

  maxFrameGapMs(nowMs: number): number {
    return this.frameGaps.max(nowMs);
  }
}

export const frameTiming = new FrameTimingProbe();
