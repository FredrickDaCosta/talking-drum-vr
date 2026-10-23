/**
 * Rolling frame-time statistics over a time window (in-VR debug panel). Samples live in
 * pre-allocated typed arrays used as a ring buffer, so `push()` and `statsInto()` never allocate.
 */
export interface FrameStats {
  /** Mean frame time (ms) and the frames per second it implies; NaN with no samples. */
  avgMs: number;
  fps: number;
  maxMs: number;
  count: number;
}

export class FrameStatsWindow {
  private readonly times: Float64Array;
  private readonly values: Float64Array;
  private next = 0;
  private size = 0;

  constructor(
    readonly windowMs: number,
    readonly capacity: number,
  ) {
    this.times = new Float64Array(capacity);
    this.values = new Float64Array(capacity);
  }

  push(timeMs: number, frameMs: number): void {
    if (!Number.isFinite(timeMs) || !Number.isFinite(frameMs) || frameMs <= 0) {
      return;
    }
    this.times[this.next] = timeMs;
    this.values[this.next] = frameMs;
    this.next = (this.next + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size += 1;
    }
  }

  /** Writes average / max / fps over (nowMs - windowMs, nowMs] into `out`. */
  statsInto(nowMs: number, out: FrameStats): FrameStats {
    let sum = 0;
    let max = Number.NaN;
    let count = 0;
    const cutoff = nowMs - this.windowMs;
    for (let i = 0; i < this.size; i += 1) {
      const t = this.times[i];
      if (t > cutoff && t <= nowMs) {
        const v = this.values[i];
        sum += v;
        count += 1;
        if (!(v <= max)) {
          max = v;
        }
      }
    }
    out.count = count;
    out.avgMs = count > 0 ? sum / count : Number.NaN;
    out.fps = count > 0 ? 1000 / out.avgMs : Number.NaN;
    out.maxMs = max;
    return out;
  }

  reset(): void {
    this.next = 0;
    this.size = 0;
  }
}
