import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/**
 * P2a squeeze / pitch e2e with injected IWER hands. IWER ships three hand poses (no fist):
 * `default` (relaxed, fingers mostly open: curl ~0.89 palm lengths) and `point` (index out,
 * middle/ring/pinky curled: curl ~0.58). We switch the LEFT hand between them through
 * `xrDevice.hands.left.poseId`, which drives real XRHand joint poses through the app.
 */

const rawBasePath = process.env.BASE_PATH ?? '/';
const normalizedBasePath = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`;
const defaultPreviewUrl = `https://localhost:4173${normalizedBasePath.endsWith('/') ? normalizedBasePath : `${normalizedBasePath}/`}`;
const targetUrl = process.env.LIVE_URL ?? defaultPreviewUrl;
const iwerBundlePath = path.resolve(process.cwd(), 'node_modules/iwer/build/iwer.min.js');

interface IwerHands {
  hands: {
    left: { poseId: string };
    right: {
      position: { set: (x: number, y: number, z: number) => void };
      quaternion: { set: (x: number, y: number, z: number, w: number) => void };
    };
  };
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function enterVrWithIwerHands(page: Page, query: string): Promise<void> {
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

async function setLeftPose(page: Page, poseId: 'default' | 'point'): Promise<void> {
  await page.evaluate((id) => {
    (window as unknown as { __xrDevice: IwerHands }).__xrDevice.hands.left.poseId = id;
  }, poseId);
}

async function pitchState(page: Page) {
  return page.evaluate(() => ({ ...window.__talkingDrumPitch! }));
}

/** One scripted right-hand strike through the drum centre (retries only on >140 ms frames). */
async function rightHandStrike(page: Page): Promise<boolean> {
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

test.describe('Talking Drum VR — P2a squeeze and pitch (IWER hands)', () => {
  test('left-hand poses map to pitch bands with defaults (?calib=0) and a strike plays the latched pitch', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await enterVrWithIwerHands(page, 'debug=1&calib=0');

    // Relaxed default pose -> mostly open hand -> band L, pitch below 1.0.
    await expect
      .poll(async () => (await pitchState(page)).tracking, { timeout: 5000 })
      .toBe('TRACKED');
    await expect.poll(async () => (await pitchState(page)).band, { timeout: 3000 }).toBe('L');
    const relaxed = await pitchState(page);
    expect(relaxed.calibration).toBe('skipped');
    expect(relaxed.squeeze).toBeLessThan(0.33);
    expect(relaxed.pitchRatio).toBeLessThan(1);
    expect(relaxed.rawCurl).toBeGreaterThan(0.8);

    // Point pose curls middle/ring/pinky -> higher squeeze -> band M.
    await setLeftPose(page, 'point');
    await expect.poll(async () => (await pitchState(page)).band, { timeout: 3000 }).toBe('M');
    const pointing = await pitchState(page);
    expect(pointing.rawCurl).toBeLessThan(relaxed.rawCurl - 0.2);
    expect(pointing.squeeze).toBeGreaterThan(0.35);
    expect(pointing.squeeze).toBeLessThan(0.67);
    expect(pointing.pitchRatio).toBeGreaterThan(relaxed.pitchRatio);

    const hud = page.getByTestId('debug-hud-pitch');
    await expect(hud).toContainText('pitch hand(left): TRACKED');
    await expect(hud).toContainText('band M');
    await expect(hud).toContainText('calib skipped');

    // A right-hand strike latches this squeeze and plays at its pitch ratio.
    expect(await rightHandStrike(page)).toBe(true);
    const after = await page.evaluate(() => ({
      pitch: { ...window.__talkingDrumPitch! },
      audio: { ...window.__talkingDrumAudio! },
    }));
    expect(after.pitch.strikesLatched).toBe(1);
    expect(after.pitch.latchedBand).toBe('M');
    expect(after.audio.voicesStartedCount).toBe(1);
    expect(after.audio.lastPlaybackRate).toBeCloseTo(after.pitch.latchedPitchRatio, 9);
    expect(after.audio.lastPlaybackRate).toBeGreaterThan(1);

    // The squeeze hand never strikes, and nothing logged an error.
    expect(after.pitch.strikesLatched).toBe(
      await page.evaluate(() => window.__talkingDrumRuntime!.strikeCount),
    );
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('guided calibration captures open and fist, then maps them to bands L and H', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await enterVrWithIwerHands(page, 'debug=1');
    const status = page.getByTestId('vr-status-message');

    await expect(status).toContainText('open your LEFT hand', { timeout: 6000 });
    await expect(status).toContainText('make a tight FIST', { timeout: 6000 });
    await setLeftPose(page, 'point');
    await expect
      .poll(async () => (await pitchState(page)).calibration, { timeout: 6000 })
      .not.toMatch(/^(waiting-for-hand|open|fist)$/);
    const result = await pitchState(page);
    console.log(
      `[e2e] calibration result: ${JSON.stringify({ phase: result.calibration, reason: result.calibrationFailureReason, open: result.calibrationOpenCurl, fist: result.calibrationFistCurl })}`,
    );
    expect(result.calibration, result.calibrationFailureReason).toBe('done');
    await expect(status).toContainText('Calibrated');

    const calibrated = await pitchState(page);
    // IWER reference poses: default ~0.886 and point ~0.582 palm lengths.
    expect(calibrated.calibrationOpenCurl).toBeGreaterThan(0.84);
    expect(calibrated.calibrationOpenCurl).toBeLessThan(0.93);
    expect(calibrated.calibrationFistCurl).toBeGreaterThan(0.54);
    expect(calibrated.calibrationFistCurl).toBeLessThan(0.63);

    // With these limits, point is now a full squeeze (H) and default is open (L).
    await expect.poll(async () => (await pitchState(page)).band, { timeout: 3000 }).toBe('H');
    await setLeftPose(page, 'default');
    await expect.poll(async () => (await pitchState(page)).band, { timeout: 3000 }).toBe('L');

    // The result message clears after a few seconds.
    await expect(status).toBeHidden({ timeout: 6000 });
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
