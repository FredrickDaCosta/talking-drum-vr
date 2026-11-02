import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../src/app/config.js';
import { type FrameStats, FrameStatsWindow } from '../../src/debug/frame-stats.js';
import { MarkLog } from '../../src/debug/mark-log.js';
import { isInsidePanel, PanelTouch } from '../../src/debug/panel-touch.js';
import {
  createVrDebugSnapshot,
  formatVrDebugLines,
  num,
  VR_DEBUG_LINE_COUNT,
} from '../../src/debug/vr-debug-format.js';
import { debugPanelLayout } from '../../src/debug/vr-debug-layout.js';

const stats = (): FrameStats => ({ avgMs: 0, fps: 0, maxMs: 0, count: 0 });

describe('FrameStatsWindow (ring buffer)', () => {
  it('averages frame time over the window and derives FPS and max', () => {
    const w = new FrameStatsWindow(5000, 1024);
    for (let i = 1; i <= 72; i += 1) {
      w.push(i * 13.9, 13.9);
    }
    w.push(72 * 13.9 + 30, 30);
    const s = w.statsInto(72 * 13.9 + 30, stats());
    expect(s.count).toBe(73);
    expect(s.maxMs).toBe(30);
    expect(s.avgMs).toBeCloseTo((72 * 13.9 + 30) / 73, 9);
    expect(s.fps).toBeCloseTo(1000 / s.avgMs, 9);
  });

  it('drops samples outside the window and the oldest beyond capacity; ignores bad input', () => {
    const w = new FrameStatsWindow(1000, 4);
    w.push(0, 50);
    w.push(500, 10);
    w.push(Number.NaN, 10);
    w.push(600, -1);
    expect(w.statsInto(1200, stats())).toMatchObject({ count: 1, maxMs: 10 });
    for (let t = 1100; t < 1150; t += 10) {
      w.push(t, 20);
    }
    expect(w.statsInto(1150, stats()).count).toBe(4); // capacity
    const empty = new FrameStatsWindow(1000, 4).statsInto(0, stats());
    expect(empty.count).toBe(0);
    expect(Number.isNaN(empty.fps)).toBe(true);
  });
});

describe('MarkLog (ring buffer)', () => {
  it('keeps the newest marks with their context, numbered from 1', () => {
    const log = new MarkLog(3);
    expect(log.newest(0)).toBeNull();
    for (let i = 1; i <= 5; i += 1) {
      log.push(i * 10, i * 2, 0.5 + i / 10, 0.01 * i, 'YOUR_TURN', `p${i}`);
    }
    expect(log.count).toBe(5);
    expect(log.newest(0)).toMatchObject({ index: 5, timeSec: 50, strikeCount: 10, phraseId: 'p5' });
    expect(log.newest(2)?.index).toBe(3);
    expect(log.newest(3)).toBeNull();
    expect(log.toArray().map((m) => m.index)).toEqual([3, 4, 5]);
  });

  it('reuses its slots (no allocation per mark)', () => {
    const log = new MarkLog(2);
    const a = log.push(1, 1, 1, 1, '', '');
    log.push(2, 2, 2, 2, '', '');
    const c = log.push(3, 3, 3, 3, '', '');
    expect(c).toBe(a);
  });
});

describe('formatVrDebugLines', () => {
  it('formats every field as plain "label|value" lines with a fixed line count', () => {
    const s = createVrDebugSnapshot();
    Object.assign(s, {
      fps: 71.94,
      frameAvgMs: 13.9,
      frameMaxMs: 22.13,
      maxFrameGapMs: 30.2,
      strikeCount: 21,
      lastSpeedMps: 1.423,
      lastRadialMeters: 0.0321,
      pipelineMs: 0.61,
      baseLatencyMs: 10,
      outputLatencyMs: 32,
      rightHand: 'TRACKED',
      leftHand: 'HELD',
      squeeze: 0.612,
      band: 'M',
      pitchRatio: 1.07,
      calibration: 'done',
      openCurl: 0.886,
      fistCurl: 0.582,
      audioState: 'running',
      skippedNotRunning: 2,
      lessonPhase: 'YOUR_TURN',
      lessonLevel: 2,
      phraseId: 'l2-oko-mh',
      sessionElapsedSec: 192.7,
      sessionCapSec: 510,
    });
    const marks = new MarkLog(4);
    marks.push(312.44, 140, 0.42, 0.05, 'DEMO', 'l2-oko-mh');
    const lines = formatVrDebugLines(s, marks, []);
    expect(lines).toHaveLength(VR_DEBUG_LINE_COUNT);
    expect(lines).toEqual([
      'FPS|71.9   frame avg 13.9 / max 22.1 ms (5 s)',
      'Frame gap|max 30.2 ms (5 s)',
      'Strikes|21   last 1.42 m/s   r 0.032 m',
      'Pipeline|0.61 ms   base 10.0 / out 32.0 ms',
      'Hands|R TRACKED   L HELD',
      'Squeeze|0.61   band M   pitch 1.07',
      'Calib|done   open 0.89   fist 0.58',
      'Audio|running   skip nc 0 nr 2 nb 0 inv 0',
      'Lesson|YOUR_TURN   L2   l2-oko-mh',
      'Session|3:12 / cap 8:30   not reached',
      'Marks|1   (touch panel: R = mark, L = hide)',
      '|#1 t 312.4 s  strikes 140  v 0.42  DEMO l2-oko-mh',
      '|',
    ]);
    for (const line of lines) {
      expect(line).toMatch(/^[\x20-\x7e]*$/); // plain ASCII
    }
  });

  it('shows "--" for missing numbers', () => {
    expect(num(Number.NaN, 1)).toBe('--');
    const lines = formatVrDebugLines(createVrDebugSnapshot(), new MarkLog(2), []);
    expect(lines[0]).toBe('FPS|--   frame avg -- / max -- ms (5 s)');
    expect(lines[8]).toBe('Lesson|-   L0   -');
    expect(lines[9]).toBe('Session|-- / cap --   not reached');
    const capped = { ...createVrDebugSnapshot(), sessionElapsedSec: 515, sessionCapSec: 510 };
    expect(formatVrDebugLines({ ...capped, capReached: true }, new MarkLog(2), [])[9]).toBe(
      'Session|8:35 / cap 8:30   reached (finishing phrase)',
    );
    expect(
      formatVrDebugLines({ ...capped, capReached: true, capped: true }, new MarkLog(2), [])[9],
    ).toBe('Session|8:35 / cap 8:30   ended session');
  });
});

describe('panel touch', () => {
  it('fires once per entry and re-arms only after leaving for rearmMs', () => {
    const t = new PanelTouch(600);
    expect(t.update(0, true)).toBe(true);
    expect(t.update(16, true)).toBe(false); // resting finger
    expect(t.update(32, false)).toBe(false);
    expect(t.update(100, true)).toBe(false); // jitter back in before re-arm
    expect(t.update(120, false)).toBe(false);
    expect(t.update(719, false)).toBe(false);
    expect(t.update(720, false)).toBe(false); // re-armed now
    expect(t.update(736, true)).toBe(true);
  });

  it('tests a point against the panel box', () => {
    const w = APP_CONFIG.debugPanel.widthMeters;
    const h = APP_CONFIG.debugPanel.heightMeters;
    const d = APP_CONFIG.debugPanel.touchDepthMeters;
    expect(isInsidePanel(0, 0, 0, w, h, d)).toBe(true);
    expect(isInsidePanel(w / 2, -h / 2, d, w, h, d)).toBe(true);
    expect(isInsidePanel(w / 2 + 0.001, 0, 0, w, h, d)).toBe(false);
    expect(isInsidePanel(0, 0, d + 0.001, w, h, d)).toBe(false);
    expect(isInsidePanel(Number.NaN, 0, 0, w, h, d)).toBe(false);
  });
});

describe('debug panel placement', () => {
  it('is within the 0.61 m reach, faces the eye, and clears the drum, lesson panel and ladder', () => {
    const l = debugPanelLayout();
    expect(l.maxReachMeters).toBeLessThanOrEqual(0.61);
    expect(l.facingErrorDeg).toBeLessThan(0.01);
    expect(l.drumClearanceMeters).toBeGreaterThan(0.08);
    expect(l.lessonPanelClearanceMeters).toBeGreaterThan(0.1);
    expect(l.ladderClearanceMeters).toBeGreaterThan(0.2);
    // Low and to the right of the drum (the left side has the pitch ladder).
    expect(l.centre[0]).toBeGreaterThan(0.2);
    expect(l.centre[1]).toBeLessThan(APP_CONFIG.drumPlacement.defaultEyeLevelMeters - 0.25);
  });
});
