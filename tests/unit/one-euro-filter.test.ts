import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../src/app/config.js';
import {
  OneEuroFilter3D,
  computeSmoothingAlpha,
  type MutableVec3,
} from '../../src/input/one-euro-filter.js';
import { FRAME_INTERVAL_72HZ_MS } from '../fixtures/hand-paths.js';

describe('OneEuroFilter3D', () => {
  it('keeps effective tracking lag <= 1 frame at 72 Hz (13.89 ms) for strike speeds >= 0.5 m/s', () => {
    const filter = new OneEuroFilter3D(APP_CONFIG.strikeFilter);
    const out: MutableVec3 = { x: 0, y: 0, z: 0 };

    for (const speedMetersPerSec of [0.5, 0.85, 1.5]) {
      filter.reset();
      // Run 20 frames at 72 Hz along -Y at constant speed
      let lastTrueY = 0;
      let lastFilteredY = 0;
      for (let i = 0; i <= 20; i++) {
        const tMs = i * FRAME_INTERVAL_72HZ_MS;
        const trueY = 0.3 - speedMetersPerSec * (tMs / 1000);
        const ok = filter.filterInto(0, trueY, 0, tMs, out);
        expect(ok).toBe(true);
        lastTrueY = trueY;
        lastFilteredY = out.y;
      }

      // Effective position lag (meters) divided by speed (m/s) gives effective time lag in seconds
      const positionLagMeters = Math.abs(lastFilteredY - lastTrueY);
      const effectiveLagMs = (positionLagMeters / speedMetersPerSec) * 1000;
      expect(effectiveLagMs).toBeLessThanOrEqual(FRAME_INTERVAL_72HZ_MS);
    }
  });

  it('attenuates high-frequency stationary jitter more strongly in visualFilter than strikeFilter', () => {
    const strikeFilter = new OneEuroFilter3D(APP_CONFIG.strikeFilter);
    const visualFilter = new OneEuroFilter3D(APP_CONFIG.visualFilter);
    const strikeOut: MutableVec3 = { x: 0, y: 0, z: 0 };
    const visualOut: MutableVec3 = { x: 0, y: 0, z: 0 };

    let visualDeviationSum = 0;
    let strikeDeviationSum = 0;

    for (let i = 0; i < 30; i++) {
      const tMs = i * FRAME_INTERVAL_72HZ_MS;
      // 1.5 mm alternating stationary jitter around y = 0.25 m
      const jitter = (i % 2 === 0 ? 1 : -1) * 0.0015;
      strikeFilter.filterInto(0, 0.25 + jitter, 0, tMs, strikeOut);
      visualFilter.filterInto(0, 0.25 + jitter, 0, tMs, visualOut);
      if (i >= 5) {
        strikeDeviationSum += Math.abs(strikeOut.y - 0.25);
        visualDeviationSum += Math.abs(visualOut.y - 0.25);
      }
    }

    expect(visualDeviationSum).toBeLessThan(strikeDeviationSum);
  });

  it('resets filter history after a tracking dropout exceeding maxGapMs (100 ms)', () => {
    const filter = new OneEuroFilter3D(APP_CONFIG.visualFilter);
    const out: MutableVec3 = { x: 0, y: 0, z: 0 };

    filter.filterInto(0.1, 0.2, -0.5, 1000, out);
    filter.filterInto(0.1, 0.2, -0.5, 1014, out);

    // 250 ms tracking gap (> maxGapMs = 100 ms) jumping to a new position
    filter.filterInto(0.4, 0.6, -0.3, 1264, out);
    expect(out).toEqual({ x: 0.4, y: 0.6, z: -0.3 });
  });

  it('rejects NaN or non-finite coordinates/timestamps and resets cleanly for subsequent valid samples', () => {
    const filter = new OneEuroFilter3D(APP_CONFIG.strikeFilter);
    const out: MutableVec3 = { x: 0, y: 0, z: 0 };

    expect(filter.filterInto(0, 0.25, 0, 1000, out)).toBe(true);
    expect(filter.filter({ x: Number.NaN, y: 0.2, z: 0 }, 1014, out)).toBeNull();
    expect(filter.isInitialized()).toBe(false);

    expect(filter.filter({ x: 0, y: Number.POSITIVE_INFINITY, z: 0 }, 1028, out)).toBeNull();
    expect(filter.filter({ x: 0, y: 0.2, z: 0 }, Number.NaN, out)).toBeNull();

    // Next valid sample initializes cleanly with no NaN contamination
    const recovered = filter.filter({ x: 0.05, y: 0.22, z: -0.04 }, 1042, out);
    expect(recovered).toEqual({ x: 0.05, y: 0.22, z: -0.04 });
    expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)).toBe(true);
  });

  it('passes raw coordinates through unchanged when enabled is false', () => {
    const passthroughFilter = new OneEuroFilter3D({
      ...APP_CONFIG.strikeFilter,
      enabled: false,
    });
    const out: MutableVec3 = { x: 0, y: 0, z: 0 };

    passthroughFilter.filterInto(0, 0.3, 0, 1000, out);
    passthroughFilter.filterInto(0.12, 0.18, -0.08, 1014, out);
    expect(out).toEqual({ x: 0.12, y: 0.18, z: -0.08 });
    expect(computeSmoothingAlpha(0, 0.014)).toBe(1);
  });
});
