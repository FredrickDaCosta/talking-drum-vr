import { describe, expect, it } from 'vitest';
import { FrameTimingProbe } from '../../src/debug/frame-timing.js';
import { RollingMaxWindow } from '../../src/debug/rolling-max.js';

describe('RollingMaxWindow', () => {
  it('returns NaN when empty or when every sample has aged out', () => {
    const w = new RollingMaxWindow(5000, 8);
    expect(Number.isNaN(w.max(1000))).toBe(true);
    w.push(1000, 3);
    expect(w.max(1000)).toBe(3);
    expect(Number.isNaN(w.max(6000))).toBe(true);
  });

  it('keeps the maximum inside the last windowMs only', () => {
    const w = new RollingMaxWindow(5000, 8);
    w.push(0, 50);
    w.push(2000, 10);
    w.push(4000, 20);
    expect(w.max(4000)).toBe(50);
    expect(w.max(5500)).toBe(20); // the t=0 spike has left the window
  });

  it('overwrites the oldest samples when capacity is exceeded and ignores non-finite values', () => {
    const w = new RollingMaxWindow(10_000, 3);
    w.push(1, 100);
    w.push(2, 1);
    w.push(3, 2);
    w.push(4, 3); // evicts the 100
    w.push(5, Number.NaN);
    expect(w.max(5)).toBe(3);
  });
});

describe('FrameTimingProbe', () => {
  it('records gaps between frame entries and ignores implausibly long pauses', () => {
    const p = new FrameTimingProbe();
    p.recordFrameEntry(1000);
    p.recordFrameEntry(1016.7);
    p.recordFrameEntry(1200); // 183.3 ms hitch
    p.recordFrameEntry(1213.9);
    expect(p.maxFrameGapMs(1213.9)).toBeCloseTo(183.3, 6);
    p.recordFrameEntry(9000); // tab hidden for ~8 s: not a frame hitch
    expect(p.maxFrameGapMs(9000)).toBeNaN();
    p.recordFrameEntry(9013.9);
    expect(p.maxFrameGapMs(9013.9)).toBeCloseTo(13.9, 6);
  });
});
