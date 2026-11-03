import path from 'node:path';
import { expect, type Page } from '@playwright/test';

/**
 * Shared IWER hand helpers for the e2e specs. IWER ships three hand poses (no fist): `default`
 * (relaxed, fingers mostly open: curl ~0.89 palm lengths) and `point` (index out, middle/ring/pinky
 * curled: curl ~0.58). The LEFT hand is switched between them through
 * `xrDevice.hands.left.poseId`, which drives real XRHand joint poses through the app.
 */

const rawBasePath = process.env.BASE_PATH ?? '/';
const normalizedBasePath = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`;
const defaultPreviewUrl = `https://localhost:4173${normalizedBasePath.endsWith('/') ? normalizedBasePath : `${normalizedBasePath}/`}`;
const targetUrl = process.env.LIVE_URL ?? defaultPreviewUrl;
const iwerBundlePath = path.resolve(process.cwd(), 'node_modules/iwer/build/iwer.min.js');

export interface RightHandStrikeAttempt {
  readonly intervalsMs: readonly number[];
  readonly hit: boolean;
}

export interface RightHandStrikeResult {
  readonly hit: boolean;
  readonly attempts: readonly RightHandStrikeAttempt[];
}

/**
 * Like `rightHandStrike`, but reads the drum's live `drumTopHeadNormalWorld` instead of hardcoding
 * the fixed, un-yawed tilt geometry — correct for the adaptively placed drum at any yaw, not just
 * the scene's fixed (yaw 0) orientation. Returns per-attempt frame intervals (ms) alongside the
 * hit/miss result, so a failure's frame timing is evidenced, not just its outcome.
 */
export async function rightHandStrikeAtCurrentDrumDiagnostic(
  page: Page,
): Promise<RightHandStrikeResult> {
  return page.evaluate(async () => {
    const device = (window as unknown as { __xrDevice: IwerHands }).__xrDevice;
    const runtime = window.__talkingDrumRuntime!;
    const times: number[] = [];
    const attempts: { intervalsMs: number[]; hit: boolean }[] = [];
    const nextFrame = () =>
      new Promise<number>((resolve) =>
        window.requestAnimationFrame((t) => {
          times.push(t);
          resolve(t);
        }),
      );
    device.hands.right.quaternion.set(0, 0, 0, 1);
    device.hands.right.position.set(0, 0, 0);
    await nextFrame();
    await nextFrame();
    const offset = { x: runtime.rawWorld.x, y: runtime.rawWorld.y, z: runtime.rawWorld.z };
    const place = (h: number) => {
      const y = 0.19 + h;
      const d = runtime.drumWorldPosition;
      const n = runtime.drumTopHeadNormalWorld;
      device.hands.right.position.set(
        d.x + y * n.x - offset.x,
        d.y + y * n.y - offset.y,
        d.z + y * n.z - offset.z,
      );
    };
    const hold = async (frames: number, h: number) => {
      for (let i = 0; i < frames; i += 1) {
        place(h);
        await nextFrame();
      }
    };
    await hold(6, 0.06);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) {
        const t0 = performance.now();
        while (performance.now() - t0 < 160) {
          place(0.06);
          await nextFrame();
        }
      }
      const before = runtime.strikeCount;
      const index = times.length;
      await hold(1, 0.025);
      await hold(3, -0.02);
      const slice = times.slice(index, index + 4);
      const intervalsMs = slice.slice(1).map((t, i) => t - slice[i]);
      const hit = runtime.strikeCount > before;
      attempts.push({ intervalsMs, hit });
      if (hit) {
        return { hit: true, attempts };
      }
      const slow = intervalsMs.slice(0, 2).some((gap) => gap > 140);
      if (!slow) {
        return { hit: false, attempts };
      }
    }
    return { hit: false, attempts };
  });
}

/** Like `rightHandStrikeAtCurrentDrumDiagnostic`, discarding the per-attempt timing. */
export async function rightHandStrikeAtCurrentDrum(page: Page): Promise<boolean> {
  return (await rightHandStrikeAtCurrentDrumDiagnostic(page)).hit;
}

interface IwerHands {
  hands: {
    left: { poseId: string };
    right: {
      position: { set: (x: number, y: number, z: number) => void };
      quaternion: { set: (x: number, y: number, z: number, w: number) => void };
    };
  };
}

export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

export async function enterVrWithIwerHands(page: Page, query: string): Promise<void> {
  await page.addInitScript({ path: iwerBundlePath });
  await page.addInitScript(() => {
    const iwer = (
      window as unknown as {
        IWER: {
          XRDevice: new (config: unknown) => {
            installRuntime: (opts?: { forceInstall?: boolean }) => void;
            primaryInputMode: 'controller' | 'hand';
          };
          metaQuest3: unknown;
        };
      }
    ).IWER;
    const device = new iwer.XRDevice(iwer.metaQuest3);
    device.installRuntime({ forceInstall: true });
    device.primaryInputMode = 'hand';
    (window as unknown as Record<string, unknown>).__xrDevice = device;
  });
  const separator = targetUrl.includes('?') ? '&' : '?';
  const response = await page.goto(`${targetUrl}${separator}${query}`, {
    waitUntil: 'networkidle',
  });
  expect(response?.status()).toBeLessThan(400);
  await page.getByTestId('enter-vr-button').click();
  await expect(page.getByTestId('enter-vr-button')).toHaveText('Exit VR');
}

/** Sets the emulated headset's world position and yaw (radians; 0 = facing -Z, same convention as
 * `yawFromQuaternion` in src/game/adaptive-placement.ts). */
export async function setHeadPose(
  page: Page,
  position: { x: number; y: number; z: number },
  yawRad: number,
): Promise<void> {
  await page.evaluate(
    ({ position, yawRad }) => {
      const device = (
        window as unknown as {
          __xrDevice: {
            position: { set: (x: number, y: number, z: number) => void };
            quaternion: { set: (x: number, y: number, z: number, w: number) => void };
          };
        }
      ).__xrDevice;
      device.position.set(position.x, position.y, position.z);
      const half = yawRad / 2;
      device.quaternion.set(0, Math.sin(half), 0, Math.cos(half));
    },
    { position, yawRad },
  );
}

/**
 * Like `enterVrWithIwerHands`, but sets the emulated headset's position and yaw inside the same
 * init script that creates the device, before the page's first script runs — so the app's own
 * head-pose stability window (`AdaptivePlacementSystem`) never sees the device's un-overridden
 * default pose at all. Setting the pose only after entering VR races that stability window: under
 * load, the default pose can sit "stable" long enough to be placed on before a later override
 * arrives, since nothing but a recentre re-triggers placement.
 */
export async function enterVrWithIwerHandsAtPose(
  page: Page,
  query: string,
  position: { x: number; y: number; z: number },
  yawRad: number,
): Promise<void> {
  await page.addInitScript({ path: iwerBundlePath });
  await page.addInitScript(
    ({ position, yawRad }) => {
      const iwer = (
        window as unknown as {
          IWER: {
            XRDevice: new (config: unknown) => {
              installRuntime: (opts?: { forceInstall?: boolean }) => void;
              primaryInputMode: 'controller' | 'hand';
              position: { set: (x: number, y: number, z: number) => void };
              quaternion: { set: (x: number, y: number, z: number, w: number) => void };
            };
            metaQuest3: unknown;
          };
        }
      ).IWER;
      const device = new iwer.XRDevice(iwer.metaQuest3);
      device.installRuntime({ forceInstall: true });
      device.primaryInputMode = 'hand';
      device.position.set(position.x, position.y, position.z);
      const half = yawRad / 2;
      device.quaternion.set(0, Math.sin(half), 0, Math.cos(half));
      (window as unknown as Record<string, unknown>).__xrDevice = device;
    },
    { position, yawRad },
  );
  const separator = targetUrl.includes('?') ? '&' : '?';
  const response = await page.goto(`${targetUrl}${separator}${query}`, {
    waitUntil: 'networkidle',
  });
  expect(response?.status()).toBeLessThan(400);
  await page.getByTestId('enter-vr-button').click();
  await expect(page.getByTestId('enter-vr-button')).toHaveText('Exit VR');
}

export async function setLeftPose(page: Page, poseId: 'default' | 'point'): Promise<void> {
  await page.evaluate((id) => {
    (window as unknown as { __xrDevice: IwerHands }).__xrDevice.hands.left.poseId = id;
  }, poseId);
}

export async function pitchState(page: Page) {
  return page.evaluate(() => ({ ...window.__talkingDrumPitch! }));
}

/** One scripted right-hand strike through the drum centre (retries only on >140 ms frames). */
export async function rightHandStrike(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const device = (window as unknown as { __xrDevice: IwerHands }).__xrDevice;
    const runtime = window.__talkingDrumRuntime!;
    const times: number[] = [];
    const nextFrame = () =>
      new Promise<number>((resolve) =>
        window.requestAnimationFrame((t) => {
          times.push(t);
          resolve(t);
        }),
      );
    device.hands.right.quaternion.set(0, 0, 0, 1);
    device.hands.right.position.set(0, 0, 0);
    await nextFrame();
    await nextFrame();
    const offset = { x: runtime.rawWorld.x, y: runtime.rawWorld.y, z: runtime.rawWorld.z };
    const tilt = (30 * Math.PI) / 180;
    const place = (h: number) => {
      const y = 0.19 + h;
      const d = runtime.drumWorldPosition;
      device.hands.right.position.set(
        d.x - offset.x,
        d.y + y * Math.cos(tilt) - offset.y,
        d.z + y * Math.sin(tilt) - offset.z,
      );
    };
    const hold = async (frames: number, h: number) => {
      for (let i = 0; i < frames; i += 1) {
        place(h);
        await nextFrame();
      }
    };
    await hold(6, 0.06);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) {
        const t0 = performance.now();
        while (performance.now() - t0 < 160) {
          place(0.06);
          await nextFrame();
        }
      }
      const before = runtime.strikeCount;
      const index = times.length;
      await hold(1, 0.025);
      await hold(3, -0.02);
      if (runtime.strikeCount > before) {
        return true;
      }
      const slow = times.slice(index, index + 3).some((t, i, arr) => i > 0 && t - arr[i - 1] > 140);
      if (!slow) {
        return false;
      }
    }
    return false;
  });
}
