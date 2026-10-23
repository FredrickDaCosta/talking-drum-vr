import { describe, expect, it } from 'vitest';
import { pointHandPose } from '../../node_modules/iwer/lib/device/configs/hand/point.js';
import { relaxedHandPose } from '../../node_modules/iwer/lib/device/configs/hand/relaxed.js';
import { APP_CONFIG } from '../../src/app/config.js';
import { parseAppFlags } from '../../src/app/flags.js';
import {
  bandCentreSqueezes,
  ladderReachFromDefaultEye,
  markerHeight,
} from '../../src/game/pitch-ladder-layout.js';
import { PitchBandClassifier, squeezeToPitchRatio } from '../../src/game/pitch-mapping.js';
import {
  computeHandCurlInto,
  type HandCurlResult,
  SQUEEZE_JOINT_COUNT,
  SQUEEZE_JOINTS,
  SqueezeTracker,
  squeezeFromCurl,
} from '../../src/input/hand-squeeze.js';
import { SqueezeCalibration } from '../../src/input/squeeze-calibration.js';

const sq = APP_CONFIG.squeeze;
const pitch = APP_CONFIG.pitch;

/**
 * Synthetic hand: wrist at the origin, middle knuckle `palm` metres up +Y, each finger knuckle near
 * it and each tip `curl[f] * palm` metres beyond its knuckle. By construction the hand curl equals
 * mean(curl). Optional uniform scale (hand size), rigid rotation about Z and translation.
 */
function syntheticHand(
  curl: [number, number, number, number],
  options: {
    palm?: number;
    scale?: number;
    angle?: number;
    offset?: [number, number, number];
  } = {},
): Float64Array {
  const palm = (options.palm ?? 0.095) * (options.scale ?? 1);
  const angle = options.angle ?? 0;
  const [ox, oy, oz] = options.offset ?? [0, 0, 0];
  const raw: number[][] = [[0, 0, 0]];
  const xs = [-0.022, 0, 0.02, 0.038].map((x) => x * (options.scale ?? 1));
  for (let f = 0; f < 4; f += 1) {
    const knuckleY = f === 1 ? palm : palm * 0.95;
    raw.push([xs[f], knuckleY, 0]);
    raw.push([xs[f], knuckleY + curl[f] * palm * 0.6, curl[f] * palm * 0.8]);
  }
  const out = new Float64Array(SQUEEZE_JOINT_COUNT * 3);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  raw.forEach(([x, y, z], j) => {
    out[j * 3] = x * c - y * s + ox;
    out[j * 3 + 1] = x * s + y * c + oy;
    out[j * 3 + 2] = z + oz;
  });
  return out;
}

function fromIwerPose(pose: {
  jointTransforms: Record<string, { offsetMatrix: ArrayLike<number> }>;
}) {
  const out = new Float64Array(SQUEEZE_JOINT_COUNT * 3);
  SQUEEZE_JOINTS.forEach((name, j) => {
    const m = pose.jointTransforms[name].offsetMatrix;
    out[j * 3] = m[12];
    out[j * 3 + 1] = m[13];
    out[j * 3 + 2] = m[14];
  });
  return out;
}

const result = (): HandCurlResult => ({
  curl: Number.NaN,
  palmLengthMeters: Number.NaN,
  validFingers: 0,
});

describe('hand curl and squeeze', () => {
  it('measures curl in palm lengths: open hand, fist and partial squeeze', () => {
    const open = computeHandCurlInto(syntheticHand([0.95, 0.95, 0.95, 0.95]), result()).curl;
    const fist = computeHandCurlInto(syntheticHand([0.35, 0.35, 0.35, 0.35]), result()).curl;
    const partial = computeHandCurlInto(syntheticHand([0.65, 0.65, 0.65, 0.65]), result()).curl;
    expect(open).toBeCloseTo(0.95, 9);
    expect(fist).toBeCloseTo(0.35, 9);
    expect(squeezeFromCurl(open, 0.95, 0.35)).toBeCloseTo(0, 9);
    expect(squeezeFromCurl(fist, 0.95, 0.35)).toBeCloseTo(1, 9);
    expect(squeezeFromCurl(partial, 0.95, 0.35)).toBeCloseTo(0.5, 9);
    // Beyond the calibrated limits squeeze clamps to [0, 1].
    expect(squeezeFromCurl(1.2, 0.95, 0.35)).toBe(0);
    expect(squeezeFromCurl(0.1, 0.95, 0.35)).toBe(1);
  });

  it('is independent of hand size, orientation and position', () => {
    const curl: [number, number, number, number] = [0.8, 0.6, 0.55, 0.5];
    const base = computeHandCurlInto(syntheticHand(curl), result()).curl;
    const small = computeHandCurlInto(syntheticHand(curl, { scale: 0.7 }), result()).curl;
    const large = computeHandCurlInto(syntheticHand(curl, { scale: 1.3 }), result()).curl;
    const moved = computeHandCurlInto(
      syntheticHand(curl, { angle: 1.1, offset: [0.3, 1.2, -0.4] }),
      result(),
    ).curl;
    expect(small).toBeCloseTo(base, 9);
    expect(large).toBeCloseTo(base, 9);
    expect(moved).toBeCloseTo(base, 9);
  });

  it('matches the IWER reference poses (relaxed ~0.886, point ~0.582)', () => {
    const relaxed = computeHandCurlInto(fromIwerPose(relaxedHandPose), result());
    const point = computeHandCurlInto(fromIwerPose(pointHandPose), result());
    expect(relaxed.curl).toBeCloseTo(0.886, 2);
    expect(point.curl).toBeCloseTo(0.582, 2);
    expect(relaxed.palmLengthMeters).toBeCloseTo(0.0957, 3);
    expect(point.palmLengthMeters).toBeCloseTo(0.0957, 3);
    // With default limits: relaxed is band L, point is band M.
    const sRelaxed = squeezeFromCurl(relaxed.curl, sq.defaultOpenCurl, sq.defaultFistCurl);
    const sPoint = squeezeFromCurl(point.curl, sq.defaultOpenCurl, sq.defaultFistCurl);
    expect(sRelaxed).toBeLessThan(pitch.lowBandMax);
    expect(sPoint).toBeGreaterThan(pitch.lowBandMax);
    expect(sPoint).toBeLessThan(pitch.highBandMin);
  });

  it('uses the remaining fingers when some joints are missing, and rejects unusable frames', () => {
    const hand = syntheticHand([0.5, 0.5, 0.5, 0.9]);
    hand.fill(Number.NaN, 7 * 3, 9 * 3); // pinky missing
    const partial = computeHandCurlInto(hand, result());
    expect(partial.validFingers).toBe(3);
    expect(partial.curl).toBeCloseTo(0.5, 9);

    const mostlyMissing = syntheticHand([0.5, 0.5, 0.5, 0.5]);
    mostlyMissing.fill(Number.NaN, 1 * 3, 7 * 3); // index, middle, ring knuckles/tips missing
    expect(Number.isNaN(computeHandCurlInto(mostlyMissing, result()).curl)).toBe(true);

    const noWrist = syntheticHand([0.5, 0.5, 0.5, 0.5]);
    noWrist[0] = Number.NaN;
    expect(Number.isNaN(computeHandCurlInto(noWrist, result()).curl)).toBe(true);

    const giantPalm = syntheticHand([0.5, 0.5, 0.5, 0.5], { palm: 0.3 });
    expect(Number.isNaN(computeHandCurlInto(giantPalm, result()).curl)).toBe(true);
  });

  it('smooths noisy input: filtered squeeze varies less than the raw value', () => {
    const tracker = new SqueezeTracker(sq);
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const raws: number[] = [];
    const filtered: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      const t = i * (1000 / 72);
      // +/- 3 mm joint jitter on a 9.5 cm palm ~ +/- 0.05 squeeze around a held 0.5.
      const raw = 0.5 + (rand() - 0.5) * 0.1;
      raws.push(raw);
      filtered.push(tracker.update(raw, t));
    }
    const sd = (a: number[]) => {
      const tail = a.slice(100);
      const m = tail.reduce((x, y) => x + y, 0) / tail.length;
      return Math.sqrt(tail.reduce((x, y) => x + (y - m) ** 2, 0) / tail.length);
    };
    expect(sd(filtered)).toBeLessThan(sd(raws) * 0.6);
    expect(Math.abs(filtered[filtered.length - 1] - 0.5)).toBeLessThan(0.05);
  });

  it('holds the last value briefly when tracking drops, then falls back to neutral and flags LOST', () => {
    const tracker = new SqueezeTracker({ ...sq, filter: { ...sq.filter, enabled: false } });
    tracker.update(0.9, 0);
    expect(tracker.tracking).toBe('TRACKED');
    expect(tracker.update(Number.NaN, 100)).toBeCloseTo(0.9, 9);
    expect(tracker.tracking).toBe('HELD');
    expect(tracker.update(Number.NaN, 100 + sq.missingHoldMs)).toBe(sq.neutralSqueeze);
    expect(tracker.tracking).toBe('LOST');
    expect(tracker.update(0.2, 1000)).toBeCloseTo(0.2, 9);
    expect(tracker.tracking).toBe('TRACKED');
  });
});

describe('squeeze calibration', () => {
  const run = (
    cal: SqueezeCalibration,
    from: number,
    to: number,
    curlAt: (t: number) => number,
    step = 1000 / 72,
  ) => {
    for (let t = from; t <= to; t += step) {
      cal.update(t, curlAt(t));
    }
  };

  it('waits for the hand, then captures open and fist medians', () => {
    const cal = new SqueezeCalibration(sq);
    cal.start(0, false);
    run(cal, 0, 500, () => Number.NaN);
    expect(cal.phase).toBe('waiting-for-hand');
    run(cal, 500, 2600, () => 1.02);
    expect(cal.phase).toBe('fist');
    expect(cal.prompt(2600)).toContain('FIST');
    run(cal, 2600, 4700, () => 0.31);
    expect(cal.phase).toBe('done');
    expect(cal.openCurl).toBeCloseTo(1.02, 9);
    expect(cal.fistCurl).toBeCloseTo(0.31, 9);
    expect(cal.prompt(4700)).toContain('Calibrated');
    expect(cal.prompt(4700 + sq.calibrationResultMessageMs + 1)).toBeNull();
  });

  it('ignores the settle period and rejects outliers via the median', () => {
    const cal = new SqueezeCalibration(sq);
    cal.start(0, false);
    let i = 0;
    // Hand still opening during the settle time (curl 0.4), then open (1.0) with occasional spikes.
    run(cal, 0, 2100, (t) => (t < 400 ? 0.4 : (i += 1) % 9 === 0 ? 0.1 : 1.0));
    run(cal, 2100, 4200, (t) => (t < 2500 ? 0.9 : (i += 1) % 7 === 0 ? 1.5 : 0.33));
    expect(cal.phase).toBe('done');
    expect(cal.openCurl).toBeCloseTo(1.0, 9);
    expect(cal.fistCurl).toBeCloseTo(0.33, 9);
  });

  it('fails safe to defaults when open and fist are too similar, values are implausible, or samples are too few', () => {
    const similar = new SqueezeCalibration(sq);
    similar.start(0, false);
    run(similar, 0, 2100, () => 0.8);
    run(similar, 2100, 4300, () => 0.7);
    expect(similar.phase).toBe('failed');
    expect(similar.failureReason).toContain('too similar');
    expect(similar.openCurl).toBe(sq.defaultOpenCurl);
    expect(similar.fistCurl).toBe(sq.defaultFistCurl);
    expect(similar.prompt(4300)).toContain('default');

    const implausible = new SqueezeCalibration(sq);
    implausible.start(0, false);
    run(implausible, 0, 2100, () => 2.5);
    run(implausible, 2100, 4300, () => 0.4);
    expect(implausible.failureReason).toContain('implausible');

    const lost = new SqueezeCalibration(sq);
    lost.start(0, false);
    lost.update(0, 0.9);
    run(lost, 1, 4500, () => Number.NaN);
    expect(lost.phase).toBe('failed');
    expect(lost.failureReason).toContain('too few samples');
  });

  it('can be skipped (?calib=0) and cancelled; a finished calibration is kept', () => {
    const skipped = new SqueezeCalibration(sq);
    skipped.start(0, true);
    expect(skipped.phase).toBe('skipped');
    expect(skipped.prompt(0)).toBeNull();
    expect(skipped.openCurl).toBe(sq.defaultOpenCurl);

    const cal = new SqueezeCalibration(sq);
    cal.start(0, false);
    cal.update(10, 1.0);
    expect(cal.phase).toBe('open');
    cal.cancel();
    expect(cal.phase).toBe('not-started');

    cal.start(0, false);
    run(cal, 0, 2100, () => 1.0);
    run(cal, 2100, 4300, () => 0.3);
    expect(cal.phase).toBe('done');
    cal.start(5000, false);
    expect(cal.phase).toBe('done');
  });

  it('names the squeeze hand in prompts (right hand when ?hand=left)', () => {
    const cal = new SqueezeCalibration(sq, 'right');
    cal.start(0, false);
    cal.update(0, 1.0);
    expect(cal.prompt(0)).toContain('RIGHT hand');
  });
});

describe('pitch mapping', () => {
  it('maps squeeze 0 / 0.5 / 1 to low / mid / high ratio with log interpolation', () => {
    expect(squeezeToPitchRatio(0)).toBeCloseTo(0.75, 12);
    expect(squeezeToPitchRatio(0.5)).toBeCloseTo(1.0, 12);
    expect(squeezeToPitchRatio(1)).toBeCloseTo(1.33, 12);
    expect(squeezeToPitchRatio(0.25)).toBeCloseTo(Math.sqrt(0.75 * 1.0), 12);
    expect(squeezeToPitchRatio(0.75)).toBeCloseTo(Math.sqrt(1.0 * 1.33), 12);
  });

  it('is monotonic, clamps out-of-range squeeze and treats NaN as mid', () => {
    let previous = 0;
    for (let s = 0; s <= 1.0001; s += 0.01) {
      const r = squeezeToPitchRatio(s);
      expect(r).toBeGreaterThanOrEqual(previous);
      previous = r;
    }
    expect(squeezeToPitchRatio(-1)).toBeCloseTo(0.75, 12);
    expect(squeezeToPitchRatio(2)).toBeCloseTo(1.33, 12);
    expect(squeezeToPitchRatio(Number.NaN)).toBe(1.0);
  });
});

describe('pitch band hysteresis (L < 0.33, M, H > 0.67, h = 0.04)', () => {
  it('needs threshold + h/2 to move up and threshold - h/2 to move down', () => {
    const c = new PitchBandClassifier(pitch);
    expect(c.update(0.3)).toBe('L');
    expect(c.update(0.34)).toBe('L'); // above 0.33 but below 0.35
    expect(c.update(0.351)).toBe('M');
    expect(c.update(0.32)).toBe('M'); // below 0.33 but above 0.31
    expect(c.update(0.309)).toBe('L');
    expect(c.update(0.5)).toBe('M');
    expect(c.update(0.68)).toBe('M'); // above 0.67 but below 0.69
    expect(c.update(0.691)).toBe('H');
    expect(c.update(0.66)).toBe('H'); // below 0.67 but above 0.65
    expect(c.update(0.649)).toBe('M');
  });

  it('jumps straight between L and H, keeps the band on NaN, and uses plain thresholds first', () => {
    const c = new PitchBandClassifier(pitch);
    expect(c.update(0.9)).toBe('H');
    expect(c.update(0.1)).toBe('L');
    expect(c.update(0.95)).toBe('H');
    expect(c.update(Number.NaN)).toBe('H');
    c.reset();
    expect(c.update(0.5)).toBe('M');
  });

  it('does not flicker when squeeze jitters around a threshold', () => {
    const c = new PitchBandClassifier(pitch);
    c.update(0.2);
    const bands = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      bands.add(c.update(0.33 + (i % 2 === 0 ? 0.015 : -0.015)));
    }
    expect([...bands]).toEqual(['L']);
  });
});

describe('pitch ladder layout, flags and guardrails', () => {
  it('keeps the ladder within the 0.61 m reach of the default eye position', () => {
    const { bottom, top } = ladderReachFromDefaultEye(APP_CONFIG);
    expect(bottom).toBeLessThanOrEqual(0.61);
    expect(top).toBeLessThanOrEqual(0.61);
  });

  it('places rungs at the band centres in ascending order and clamps the marker', () => {
    const [l, m, h] = bandCentreSqueezes(pitch);
    expect(l).toBeLessThan(pitch.lowBandMax);
    expect(m).toBeGreaterThan(pitch.lowBandMax);
    expect(m).toBeLessThan(pitch.highBandMin);
    expect(h).toBeGreaterThan(pitch.highBandMin);
    expect(markerHeight(-1)).toBe(0);
    expect(markerHeight(2)).toBeCloseTo(APP_CONFIG.pitchLadder.heightMeters, 12);
    expect(markerHeight(Number.NaN)).toBeCloseTo(APP_CONFIG.pitchLadder.heightMeters / 2, 12);
  });

  it('parses ?calib=0 and leaves it absent otherwise', () => {
    expect(parseAppFlags('?calib=0').calib).toBe(false);
    expect(parseAppFlags('?calib=false&debug=1').calib).toBe(false);
    expect('calib' in parseAppFlags('?debug=1')).toBe(false);
    expect('calib' in parseAppFlags('?calib=1')).toBe(false);
  });

  it('keeps the pitch hand from triggering strikes', () => {
    expect(APP_CONFIG.strike.allowSecondaryHand).toBe(false);
  });
});
