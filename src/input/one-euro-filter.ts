import { APP_CONFIG, type OneEuroFilterConfig } from '../app/config.js';

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MutableVec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Computes the exponential smoothing factor alpha in (0, 1] for a given cutoff frequency (Hz)
 * and sample interval (seconds):
 *   alpha = 1 / (1 + tau / dt), where tau = 1 / (2 * pi * cutoffHz).
 */
export function computeSmoothingAlpha(cutoffHz: number, dtSec: number): number {
  if (cutoffHz <= 0 || dtSec <= 0 || !Number.isFinite(cutoffHz) || !Number.isFinite(dtSec)) {
    return 1;
  }
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

/**
 * Allocation-free 3D One Euro Filter (Casiez et al., CHI 2012).
 *
 * Units:
 * - Positions (x, y, z): meters (m)
 * - Timestamps: milliseconds (ms)
 * - Velocities (dx, dy, dz): meters per second (m/s)
 * - minCutoffHz, dCutoffHz: Hertz (Hz)
 * - beta: Hz per (m/s)
 * - maxGapMs: milliseconds (ms)
 */
export class OneEuroFilter3D {
  private readonly config: OneEuroFilterConfig;
  private initialized = false;
  private lastTimestampMs = 0;

  private xPrev = 0;
  private yPrev = 0;
  private zPrev = 0;

  private dxPrev = 0;
  private dyPrev = 0;
  private dzPrev = 0;

  private readonly scratchOut: MutableVec3 = { x: 0, y: 0, z: 0 };

  constructor(config: OneEuroFilterConfig = APP_CONFIG.strikeFilter) {
    this.config = config;
  }

  /** Resets filter history (e.g., when hand tracking drops out). */
  reset(): void {
    this.initialized = false;
    this.lastTimestampMs = 0;
    this.xPrev = 0;
    this.yPrev = 0;
    this.zPrev = 0;
    this.dxPrev = 0;
    this.dyPrev = 0;
    this.dzPrev = 0;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Allocation-free per-frame filter step. Writes the filtered 3D position into `out`.
   * Returns `false` and resets filter state if any input coordinate or timestamp is NaN/non-finite.
   */
  filterInto(
    x: number,
    y: number,
    z: number,
    timestampMs: number,
    out: MutableVec3 = this.scratchOut,
  ): boolean {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(timestampMs)
    ) {
      this.reset();
      return false;
    }

    if (!this.config.enabled) {
      this.initialized = true;
      this.lastTimestampMs = timestampMs;
      this.xPrev = x;
      this.yPrev = y;
      this.zPrev = z;
      this.dxPrev = 0;
      this.dyPrev = 0;
      this.dzPrev = 0;
      out.x = x;
      out.y = y;
      out.z = z;
      return true;
    }

    const dtMs = timestampMs - this.lastTimestampMs;
    if (!this.initialized || dtMs <= 0 || dtMs > this.config.maxGapMs) {
      this.initialized = true;
      this.lastTimestampMs = timestampMs;
      this.xPrev = x;
      this.yPrev = y;
      this.zPrev = z;
      this.dxPrev = 0;
      this.dyPrev = 0;
      this.dzPrev = 0;
      out.x = x;
      out.y = y;
      out.z = z;
      return true;
    }

    const dtSec = dtMs / 1000;
    const rawDx = (x - this.xPrev) / dtSec;
    const rawDy = (y - this.yPrev) / dtSec;
    const rawDz = (z - this.zPrev) / dtSec;

    const alphaD = computeSmoothingAlpha(this.config.dCutoffHz, dtSec);
    const edx = this.dxPrev + alphaD * (rawDx - this.dxPrev);
    const edy = this.dyPrev + alphaD * (rawDy - this.dyPrev);
    const edz = this.dzPrev + alphaD * (rawDz - this.dzPrev);

    const speedMetersPerSec = Math.hypot(edx, edy, edz);
    const cutoffHz = this.config.minCutoffHz + this.config.beta * speedMetersPerSec;
    const alpha = computeSmoothingAlpha(cutoffHz, dtSec);

    const fx = this.xPrev + alpha * (x - this.xPrev);
    const fy = this.yPrev + alpha * (y - this.yPrev);
    const fz = this.zPrev + alpha * (z - this.zPrev);

    this.lastTimestampMs = timestampMs;
    this.xPrev = fx;
    this.yPrev = fy;
    this.zPrev = fz;
    this.dxPrev = edx;
    this.dyPrev = edy;
    this.dzPrev = edz;

    out.x = fx;
    out.y = fy;
    out.z = fz;
    return true;
  }

  /**
   * Convenience wrapper around `filterInto`. Writes into `out` (or internal scratch vector)
   * and returns it, or `null` if the input contains NaN / non-finite numbers.
   */
  filter(
    point: Vec3Like,
    timestampMs: number,
    out: MutableVec3 = this.scratchOut,
  ): MutableVec3 | null {
    const ok = this.filterInto(point.x, point.y, point.z, timestampMs, out);
    return ok ? out : null;
  }
}
