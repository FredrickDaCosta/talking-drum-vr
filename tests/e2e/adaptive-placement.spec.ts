import { expect, test } from '@playwright/test';
import {
  enterVrWithIwerHandsAtPose,
  rightHandStrikeAtCurrentDrumDiagnostic,
  trackErrors,
} from './iwer-hands.js';

interface RuntimeSnapshot {
  drumWorldPosition: { x: number; y: number; z: number };
  drumTopHeadCenterWorld: { x: number; y: number; z: number };
  strikeCount: number;
}

async function readRuntime(page: import('@playwright/test').Page): Promise<RuntimeSnapshot> {
  return page.evaluate(() => {
    const rt = window.__talkingDrumRuntime!;
    return {
      drumWorldPosition: { ...rt.drumWorldPosition },
      drumTopHeadCenterWorld: { ...rt.drumTopHeadCenterWorld },
      strikeCount: rt.strikeCount,
    };
  });
}

/** Cases cover the task's "seated 1.0 m to standing 1.8 m" range, several positions and yaws. */
const CASES: Array<{
  name: string;
  position: { x: number; y: number; z: number };
  yawDeg: number;
}> = [
  { name: 'seated, origin, facing forward', position: { x: 0, y: 1.0, z: 0 }, yawDeg: 0 },
  { name: 'standing, origin, facing forward', position: { x: 0, y: 1.8, z: 0 }, yawDeg: 0 },
  {
    name: 'default height, offset, turned 90 deg',
    position: { x: 0.6, y: 1.6, z: -0.4 },
    yawDeg: 90,
  },
  {
    name: 'default height, offset, turned 180 deg',
    position: { x: -0.5, y: 1.5, z: 0.3 },
    yawDeg: 180,
  },
];

for (const { name, position, yawDeg } of CASES) {
  test(`adaptive placement (${name}): 0.61 m reach holds and a strike registers`, async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await enterVrWithIwerHandsAtPose(page, 'debug=1', position, (yawDeg * Math.PI) / 180);

    // Past the 1 s stabilisation window (APP_CONFIG.adaptivePlacement.stableWindowMs), with margin.
    await page.waitForTimeout(1500);

    const after = await readRuntime(page);
    const dx = after.drumTopHeadCenterWorld.x - position.x;
    const dy = after.drumTopHeadCenterWorld.y - position.y;
    const dz = after.drumTopHeadCenterWorld.z - position.z;
    const topHeadReach = Math.hypot(dx, dy, dz);
    expect(topHeadReach, 'top-head reach distance from the head').toBeLessThanOrEqual(0.61);
    expect(topHeadReach, 'matches the fixed placement’s reach (0.4454 m)').toBeCloseTo(0.4454, 2);

    expect(after.strikeCount).toBe(0);
    const strikeResult = await rightHandStrikeAtCurrentDrumDiagnostic(page);
    console.log(
      `[e2e] adaptive-placement strike attempts: ${JSON.stringify(strikeResult.attempts)}`,
    );
    expect(
      strikeResult.hit,
      `scripted right-hand strike registered at the adaptively placed, yawed drum (attempts: ${JSON.stringify(strikeResult.attempts)})`,
    ).toBe(true);
    const afterStrike = await readRuntime(page);
    expect(afterStrike.strikeCount, 'a strike registers at the adaptively placed drum').toBe(1);

    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });
}

test('?place=fixed keeps the scene-authored drum position regardless of head pose', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // A head pose that would clearly move the drum if adaptive placement were active.
  await enterVrWithIwerHandsAtPose(
    page,
    'debug=1&place=fixed',
    { x: 2, y: 1.2, z: 2 },
    Math.PI / 2,
  );
  await page.waitForTimeout(1500);
  const after = await readRuntime(page);

  // The scene-authored fixed position (public/scenes/main.iwsdk.scene.json), also asserted
  // directly in tests/unit/drum-orientation.test.ts.
  expect(after.drumWorldPosition.x).toBeCloseTo(0, 3);
  expect(after.drumWorldPosition.y).toBeCloseTo(1.25, 3);
  expect(after.drumWorldPosition.z).toBeCloseTo(-0.5, 3);
  expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
