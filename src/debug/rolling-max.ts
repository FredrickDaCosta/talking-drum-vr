/**
 * Fixed-capacity rolling maximum over a time window (debug HUD only).
 * Samples live in pre-allocated typed arrays used as a ring buffer, so `push()` and `max()` never
 * allocate. When more samples than `capacity` arrive within the window, the oldest are dropped.
 */
export class RollingMaxWindow {
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

  push(timeMs: number, value: number): void {
    if (!Number.isFinite(timeMs) || !Number.isFinite(value)) {
      return;
    }
    this.times[this.next] = timeMs;
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size += 1;
    }
  }

  /** Largest value with a timestamp in (nowMs - windowMs, nowMs]; NaN when there is none. */
  max(nowMs: number): number {
    let best = Number.NaN;
    const cutoff = nowMs - this.windowMs;
    for (let i = 0; i < this.size; i += 1) {
      const t = this.times[i];
      if (t > cutoff && t <= nowMs) {
        const v = this.values[i];
        if (!(v <= best)) {
          best = v;
        }
      }
    }
    return best;
  }

  reset(): void {
    this.next = 0;
    this.size = 0;
  }
}
