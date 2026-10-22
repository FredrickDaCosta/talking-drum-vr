import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../src/app/config.js';
import {
  createInitialStrikeHandState,
  detectStrike,
  type DrumHit,
  type HandStrikeSample,
} from '../../src/game/strike-detector.js';
import {
  SKIN_PLANE_Y_METERS,
  buildCleanDownwardStrikePath,
  buildDoubleBouncePath,
  buildJitterAtPlanePath,
  buildOffRimMissPath,
  buildQuickTapFromAbovePath,
  buildSlowHoverPath,
  buildUpwardReturnStrokePath,
} from '../fixtures/hand-paths.js';

function runTrajectory(
  samples: readonly HandStrikeSample[],
  config = APP_CONFIG,
): { hits: DrumHit[] } {
  const state = createInitialStrikeHandState();
  const hits: DrumHit[] = [];

  for (let i = 1; i < samples.length; i++) {
    const hit = detectStrike(samples[i - 1], samples[i], state, config);
    if (hit) {
      hits.push(hit);
    }
  }
  return { hits };
}

describe('detectStrike (pure swept segment vs skin plane)', () => {
  it('1. emits exactly 1 DrumHit on a clean downward strike at 0.85 m/s within the drumhead radius', () => {
    const { hits } = runTrajectory(buildCleanDownwardStrikePath());
    expect(hits).toHaveLength(1);
    const [hit] = hits;
    expect(hit.speed).toBeCloseTo(0.85, 2);
    expect(hit.position.y).toBeCloseTo(SKIN_PLANE_Y_METERS, 5);
    expect(Math.hypot(hit.position.x, hit.position.z)).toBeLessThanOrEqual(
      APP_CONFIG.drumGeometry.headRadiusMeters + APP_CONFIG.strike.hitRadiusMarginMeters,
    );
  });

  it('2. emits no hit on a slow hover crossing at 0.18 m/s (< 0.30 m/s threshold)', () => {
    const { hits } = runTrajectory(buildSlowHoverPath());
    expect(hits).toEqual([]);
  });

  it('3. suppresses a second bounce within the 90 ms debounce window', () => {
    const { hits } = runTrajectory(buildDoubleBouncePath());
    expect(hits).toHaveLength(1);
    expect(hits[0].time).toBe(3028);
  });

  it('4. emits no hit on an off-rim miss at radial distance r = 0.14 m (> 0.12 m limit)', () => {
    const { hits } = runTrajectory(buildOffRimMissPath());
    expect(hits).toEqual([]);
  });

  it('5. emits no hit on an upward return stroke from below to above the skin plane', () => {
    const { hits } = runTrajectory(buildUpwardReturnStrokePath());
    expect(hits).toEqual([]);
  });

  it('6. emits ZERO hits on jitterAtPlanePath (+/- 2.5 mm alternating at 72 Hz around skin plane)', () => {
    const { hits } = runTrajectory(buildJitterAtPlanePath());
    expect(hits).toEqual([]);
  });

  it('7. emits exactly 1 DrumHit on quickTapFromAbovePath (3 cm wind-up within 150 ms approach window)', () => {
    const { hits } = runTrajectory(buildQuickTapFromAbovePath());
    expect(hits).toHaveLength(1);
    expect(hits[0].speed).toBeGreaterThanOrEqual(APP_CONFIG.strike.minDownwardSpeedMetersPerSec);
  });

  it('rejects secondary-hand (left hand) strikes when allowSecondaryHand is false', () => {
    const leftHandStrike = buildCleanDownwardStrikePath().map((sample) => ({
      ...sample,
      hand: 'left' as const,
    }));
    const { hits } = runTrajectory(leftHandStrike, APP_CONFIG);
    expect(hits).toEqual([]);

    // When allowSecondaryHand is explicitly enabled in a custom config override, the strike succeeds
    const { hits: allowedHits } = runTrajectory(leftHandStrike, {
      ...APP_CONFIG,
      strike: {
        ...APP_CONFIG.strike,
        allowSecondaryHand: true,
      },
    });
    expect(allowedHits).toHaveLength(1);
  });

  it('handles uneven frame intervals (e.g., a 30 ms frame hitch during a downward stroke) accurately', () => {
    // Hand moves downward at a steady 0.80 m/s across an uneven 14 ms -> 30 ms (hitch) -> 14 ms sequence
    const speed = 0.8;
    const t0 = 6000;
    const y0 = SKIN_PLANE_Y_METERS + 0.025; // 0.215 m
    const t1 = 6014; // +14 ms
    const y1 = y0 - speed * 0.014; // 0.2038 m (still above 0.19 m skin plane)
    const t2 = 6044; // +30 ms frame hitch! Crosses 0.19 m skin plane during the hitch
    const y2 = y1 - speed * 0.03; // 0.1798 m (below 0.19 m skin plane)
    const t3 = 6058; // +14 ms
    const y3 = y2 - speed * 0.014;

    const unevenSamples: HandStrikeSample[] = [
      { timeMs: t0, hand: 'right', localPosition: { x: 0.03, y: y0, z: 0 } },
      { timeMs: t1, hand: 'right', localPosition: { x: 0.02, y: y1, z: 0 } },
      { timeMs: t2, hand: 'right', localPosition: { x: 0.0, y: y2, z: 0 } },
      { timeMs: t3, hand: 'right', localPosition: { x: -0.01, y: y3, z: 0 } },
    ];

    const { hits } = runTrajectory(unevenSamples);
    expect(hits).toHaveLength(1);
    expect(hits[0].time).toBe(t2);
    expect(hits[0].speed).toBeCloseTo(speed, 4);
    expect(hits[0].position.y).toBeCloseTo(SKIN_PLANE_Y_METERS, 5);
  });

  it('ignores NaN or non-finite joint poses without corrupting handState or blocking subsequent valid strikes', () => {
    const state = createInitialStrikeHandState();
    const validAbove: HandStrikeSample = {
      timeMs: 7000,
      hand: 'right',
      localPosition: { x: 0, y: 0.215, z: 0 },
    };
    const nanPose: HandStrikeSample = {
      timeMs: 7014,
      hand: 'right',
      localPosition: { x: Number.NaN, y: 0.18, z: 0 },
    };
    const infinitePose: HandStrikeSample = {
      timeMs: 7028,
      hand: 'right',
      localPosition: { x: 0, y: Number.NEGATIVE_INFINITY, z: 0 },
    };
    const nanTime: HandStrikeSample = {
      timeMs: Number.NaN,
      hand: 'right',
      localPosition: { x: 0, y: 0.18, z: 0 },
    };

    expect(detectStrike(validAbove, nanPose, state)).toBeNull();
    expect(detectStrike(nanPose, validAbove, state)).toBeNull();
    expect(detectStrike(validAbove, infinitePose, state)).toBeNull();
    expect(detectStrike(validAbove, nanTime, state)).toBeNull();
    expect(state.armed).toBe(true);
    expect(state.lastHitTimeMs).toBe(-Infinity);

    // Subsequent valid downward crossing still triggers cleanly
    const validBelow: HandStrikeSample = {
      timeMs: 7014,
      hand: 'right',
      localPosition: { x: 0, y: 0.18, z: 0 },
    };
    const hit = detectStrike(validAbove, validBelow, state);
    expect(hit).not.toBeNull();
    expect(hit?.speed).toBeGreaterThan(0.3);
  });
});
