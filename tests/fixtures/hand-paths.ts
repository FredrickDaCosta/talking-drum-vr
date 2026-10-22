/**
 * SYNTHETIC HAND-PATH FIXTURES (`tests/fixtures/hand-paths.ts`)
 *
 * NOTE: All trajectories in this file are SYNTHETIC mathematical 72 Hz paths
 * expressed in drum-local coordinates (where the top struck drumhead skin plane lies at
 * y = +lengthMeters / 2 = +0.19 m with outward normal +Y, and max hit radius = 0.12 m).
 * They serve as deterministic unit-test fixtures until a physical Meta Quest session
 * records real optical hand-tracking trajectories.
 */

import { APP_CONFIG } from '../../src/app/config.js';
import type { HandStrikeSample } from '../../src/game/strike-detector.js';

export const FRAME_INTERVAL_72HZ_MS = 1000 / 72; // ~13.8889 ms
export const SKIN_PLANE_Y_METERS = APP_CONFIG.drumGeometry.lengthMeters / 2; // 0.19 m

/**
 * 1. Clean downward strike at ~0.85 m/s near the center of the top drumhead (r = 0.028 m <= 0.12 m).
 * Expected: exactly 1 DrumHit with speed ~0.85 m/s.
 */
export function buildCleanDownwardStrikePath(): HandStrikeSample[] {
  const speed = 0.85; // m/s downward
  const startY = SKIN_PLANE_Y_METERS + 0.05; // 5 cm above skin plane
  const samples: HandStrikeSample[] = [];

  for (let i = 0; i < 8; i++) {
    const timeMs = 1000 + i * FRAME_INTERVAL_72HZ_MS;
    const elapsedSec = (i * FRAME_INTERVAL_72HZ_MS) / 1000;
    const y = startY - speed * elapsedSec;
    samples.push({
      timeMs,
      hand: 'right',
      localPosition: { x: 0.02, y, z: -0.02 },
    });
  }
  return samples;
}

/**
 * 2. Slow hover / gentle touch crossing the skin plane at 0.18 m/s (< minDownwardSpeedMetersPerSec = 0.30 m/s).
 * Expected: 0 hits (null across all steps).
 */
export function buildSlowHoverPath(): HandStrikeSample[] {
  const speed = 0.18; // m/s downward (< 0.30 m/s threshold)
  const startY = SKIN_PLANE_Y_METERS + 0.015;
  const samples: HandStrikeSample[] = [];

  for (let i = 0; i < 10; i++) {
    const timeMs = 2000 + i * FRAME_INTERVAL_72HZ_MS;
    const elapsedSec = (i * FRAME_INTERVAL_72HZ_MS) / 1000;
    const y = startY - speed * elapsedSec;
    samples.push({
      timeMs,
      hand: 'right',
      localPosition: { x: 0.0, y, z: 0.0 },
    });
  }
  return samples;
}

/**
 * 3. Double-bounce trajectory: a valid strike at t ~ 3028 ms followed by a quick micro-rebound
 * and second crossing 40 ms later (< 90 ms debounce window).
 * Expected: only 1 DrumHit (the second crossing is suppressed by debounce).
 */
export function buildDoubleBouncePath(): HandStrikeSample[] {
  return [
    { timeMs: 3000, hand: 'right', localPosition: { x: 0, y: 0.22, z: 0 } },
    { timeMs: 3014, hand: 'right', localPosition: { x: 0, y: 0.205, z: 0 } },
    // First downward crossing at ~1.07 m/s -> triggers hit #1 at 3028 ms
    { timeMs: 3028, hand: 'right', localPosition: { x: 0, y: 0.185, z: 0 } },
    // Quick rebound above rearmDistanceMeters (0.19 + 0.012 = 0.202 m)
    { timeMs: 3042, hand: 'right', localPosition: { x: 0, y: 0.202, z: 0 } },
    { timeMs: 3054, hand: 'right', localPosition: { x: 0, y: 0.205, z: 0 } },
    // Second downward crossing at 3068 ms (40 ms after 3028 ms < 90 ms debounceMs) -> suppressed
    { timeMs: 3068, hand: 'right', localPosition: { x: 0, y: 0.184, z: 0 } },
  ];
}

/**
 * 4. Off-rim miss: fast downward stroke (0.90 m/s) crossing y = +0.19 m at radial distance
 * r = 0.14 m (> headRadiusMeters 0.11 m + hitRadiusMarginMeters 0.01 m = 0.12 m).
 * Expected: 0 hits (null).
 */
export function buildOffRimMissPath(): HandStrikeSample[] {
  const speed = 0.9;
  const startY = SKIN_PLANE_Y_METERS + 0.04;
  const samples: HandStrikeSample[] = [];

  for (let i = 0; i < 6; i++) {
    const timeMs = 4000 + i * FRAME_INTERVAL_72HZ_MS;
    const elapsedSec = (i * FRAME_INTERVAL_72HZ_MS) / 1000;
    const y = startY - speed * elapsedSec;
    samples.push({
      timeMs,
      hand: 'right',
      localPosition: { x: 0.14, y, z: 0.0 },
    });
  }
  return samples;
}

/**
 * 5. Upward return stroke: hand moving rapidly upward (+0.95 m/s) from below the skin plane (0.16 m)
 * to above the skin plane (0.24 m).
 * Expected: 0 hits (null).
 */
export function buildUpwardReturnStrokePath(): HandStrikeSample[] {
  const speed = 0.95;
  const startY = SKIN_PLANE_Y_METERS - 0.03;
  const samples: HandStrikeSample[] = [];

  for (let i = 0; i < 7; i++) {
    const timeMs = 5000 + i * FRAME_INTERVAL_72HZ_MS;
    const elapsedSec = (i * FRAME_INTERVAL_72HZ_MS) / 1000;
    const y = startY + speed * elapsedSec;
    samples.push({
      timeMs,
      hand: 'right',
      localPosition: { x: 0.01, y, z: 0.01 },
    });
  }
  return samples;
}

/**
 * 6. Jitter at skin plane: +/- 2.5 mm (+/- 0.0025 m) alternating at 72 Hz around y = +0.19 m.
 * Note: 5 mm peak-to-peak over 13.89 ms has instantaneous downward speed ~0.36 m/s (> 0.30 m/s),
 * but max height above the skin plane is only 2.5 mm (< minApproachTravelMeters = 20 mm).
 * Expected: 0 hits (null across all steps).
 */
export function buildJitterAtPlanePath(): HandStrikeSample[] {
  const samples: HandStrikeSample[] = [];
  for (let i = 0; i < 16; i++) {
    const timeMs = 6000 + i * FRAME_INTERVAL_72HZ_MS;
    const offset = i % 2 === 0 ? 0.0025 : -0.0025;
    samples.push({
      timeMs,
      hand: 'right',
      localPosition: { x: 0.0, y: SKIN_PLANE_Y_METERS + offset, z: 0.0 },
    });
  }
  return samples;
}

/**
 * 7. Quick tap from above: 3 cm (0.03 m) wind-up above the skin plane descending cleanly
 * within the 150 ms approach window.
 * Expected: 1 DrumHit.
 */
export function buildQuickTapFromAbovePath(): HandStrikeSample[] {
  return [
    {
      timeMs: 7000,
      hand: 'right',
      localPosition: { x: 0.0, y: SKIN_PLANE_Y_METERS + 0.03, z: 0.0 },
    },
    {
      timeMs: 7000 + FRAME_INTERVAL_72HZ_MS,
      hand: 'right',
      localPosition: { x: 0.0, y: SKIN_PLANE_Y_METERS + 0.02, z: 0.0 },
    },
    {
      timeMs: 7000 + 2 * FRAME_INTERVAL_72HZ_MS,
      hand: 'right',
      localPosition: { x: 0.0, y: SKIN_PLANE_Y_METERS + 0.008, z: 0.0 },
    },
    {
      timeMs: 7000 + 3 * FRAME_INTERVAL_72HZ_MS,
      hand: 'right',
      localPosition: { x: 0.0, y: SKIN_PLANE_Y_METERS - 0.004, z: 0.0 },
    },
  ];
}
