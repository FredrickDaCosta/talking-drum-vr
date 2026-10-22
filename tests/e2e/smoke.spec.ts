import path from 'node:path';
import { expect, test } from '@playwright/test';

const rawBasePath = process.env.BASE_PATH ?? '/';
const normalizedBasePath = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`;
const defaultPreviewUrl = `https://localhost:4173${normalizedBasePath.endsWith('/') ? normalizedBasePath : `${normalizedBasePath}/`}`;
const targetUrl = process.env.LIVE_URL ?? defaultPreviewUrl;
const iwerBundlePath = path.resolve(process.cwd(), 'node_modules/iwer/build/iwer.min.js');

const EXPECTED_VR_UNAVAILABLE_MESSAGE =
  "VR isn't available in this browser. Open this page in Meta Quest Browser, or on a desktop use the Immersive Web Emulator extension.";

function collectThirdPartyRequests(
  trackedRequests: import('@playwright/test').Request[],
  response: import('@playwright/test').Response | null,
  finalUrl: string,
): string[] {
  const finalOrigin = new URL(finalUrl).origin;
  const navRedirectChain = new Set<import('@playwright/test').Request>();
  let navHop = response?.request() ?? null;
  while (navHop) {
    navRedirectChain.add(navHop);
    navHop = navHop.redirectedFrom();
  }

  return trackedRequests
    .filter((req) => {
      const rawUrl = req.url();
      if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
        return false;
      }
      if (navRedirectChain.has(req)) {
        return false;
      }
      return new URL(rawUrl).origin !== finalOrigin;
    })
    .map((req) => req.url());
}

test.describe('Talking Drum VR — Smoke & XR E2E Suite', () => {
  test('loads cleanly with zero console errors, zero failed/404 requests, zero third-party requests, renders Enter VR control, and tilts top drumhead toward player', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const badStatusResponses: string[] = [];
    const trackedRequests: import('@playwright/test').Request[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    page.on('request', (request) => {
      trackedRequests.push(request);
    });

    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'unknown';
      failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        badStatusResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
    expect(response?.status()).toBeLessThan(400);

    await expect(page).toHaveTitle(/Talking Drum VR/i);

    const enterVrButton = page.getByRole('button', { name: /enter vr/i });
    await expect(enterVrButton).toBeVisible();

    await expect
      .poll(async () => {
        return page.evaluate(() => window.__talkingDrumRuntime?.drumReady ?? false);
      })
      .toBe(true);

    const drumDiagnostics = await page.evaluate(() => window.__talkingDrumRuntime);
    expect(drumDiagnostics).toBeDefined();
    // Runtime world quaternion for 30 deg tilt around +X: sin(15 deg) ~= 0.2588, cos(15 deg) ~= 0.9659
    expect(drumDiagnostics?.drumWorldQuaternion.x).toBeCloseTo(Math.sin((15 * Math.PI) / 180), 3);
    expect(drumDiagnostics?.drumWorldQuaternion.y).toBeCloseTo(0, 3);
    expect(drumDiagnostics?.drumWorldQuaternion.z).toBeCloseTo(0, 3);
    expect(drumDiagnostics?.drumWorldQuaternion.w).toBeCloseTo(Math.cos((15 * Math.PI) / 180), 3);
    // Outward normal of the top drumhead (+Y local rotated +30 deg around X) must be near (0, 0.866, 0.5)
    expect(drumDiagnostics?.drumTopHeadNormalWorld.x).toBeCloseTo(0, 3);
    expect(drumDiagnostics?.drumTopHeadNormalWorld.y).toBeCloseTo(0.866, 2);
    expect(drumDiagnostics?.drumTopHeadNormalWorld.z).toBeCloseTo(0.5, 2);

    const thirdPartyRequests = collectThirdPartyRequests(trackedRequests, response, page.url());

    expect(
      thirdPartyRequests,
      `Disallowed third-party requests: ${thirdPartyRequests.join(', ')}`,
    ).toEqual([]);
    expect(badStatusResponses, `HTTP >= 400 responses: ${badStatusResponses.join(', ')}`).toEqual(
      [],
    );
    expect(failedRequests, `Failed network requests: ${failedRequests.join(', ')}`).toEqual([]);
    expect(consoleErrors, `Console/page errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('renders FPS overlay and Debug HUD when ?xrfps=1&debug=1 flags are present with zero errors or third-party requests', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const trackedRequests: import('@playwright/test').Request[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });
    page.on('request', (request) => {
      trackedRequests.push(request);
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'unknown';
      failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
    });

    const separator = targetUrl.includes('?') ? '&' : '?';
    const flaggedUrl = `${targetUrl}${separator}xrfps=1&debug=1`;

    const response = await page.goto(flaggedUrl, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('fps-overlay')).toBeVisible();
    const debugHud = page.getByTestId('debug-hud');
    await expect(debugHud).toBeVisible();
    await expect(debugHud).toContainText('hand(right): UNTRACKED');
    await expect(debugHud).toContainText('strikes: 0');

    const thirdPartyRequests = collectThirdPartyRequests(trackedRequests, response, page.url());

    expect(thirdPartyRequests).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('shows friendly VR unavailable status message on Enter VR click in headless Chromium with zero console errors, failed requests, or third-party requests', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const badStatusResponses: string[] = [];
    const trackedRequests: import('@playwright/test').Request[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });
    page.on('request', (request) => {
      trackedRequests.push(request);
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'unknown';
      failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        badStatusResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
    expect(response?.status()).toBeLessThan(400);

    const statusRegion = page.getByRole('status');
    await expect(statusRegion).toBeHidden();

    const enterVrButton = page.getByRole('button', { name: /enter vr/i });
    await enterVrButton.click();

    await expect(statusRegion).toBeVisible();
    await expect(statusRegion).toHaveText(EXPECTED_VR_UNAVAILABLE_MESSAGE);

    // Click a second time to verify re-checking support keeps the message visible and logs no errors
    await enterVrButton.click();
    await expect(statusRegion).toBeVisible();
    await expect(statusRegion).toHaveText(EXPECTED_VR_UNAVAILABLE_MESSAGE);

    const thirdPartyRequests = collectThirdPartyRequests(trackedRequests, response, page.url());

    expect(
      thirdPartyRequests,
      `Disallowed third-party requests: ${thirdPartyRequests.join(', ')}`,
    ).toEqual([]);
    expect(badStatusResponses, `HTTP >= 400 responses: ${badStatusResponses.join(', ')}`).toEqual(
      [],
    );
    expect(failedRequests, `Failed network requests: ${failedRequests.join(', ')}`).toEqual([]);
    expect(consoleErrors, `Console/page errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('scripts right-hand joints in IWER hand mode: (a) fast centre strike increments HUD strike count by 1, (b) slow descent, rim miss, and plane jitter produce 0 hits, (c) zero console errors and zero third-party requests', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const badStatusResponses: string[] = [];
    const trackedRequests: import('@playwright/test').Request[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });
    page.on('request', (request) => {
      trackedRequests.push(request);
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'unknown';
      failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        badStatusResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.addInitScript({ path: iwerBundlePath });
    await page.addInitScript(() => {
      const iwerGlobal = (
        window as unknown as {
          IWER?: {
            XRDevice: new (config: unknown) => {
              installRuntime: (opts?: { forceInstall?: boolean }) => void;
              primaryInputMode: 'controller' | 'hand';
            };
            metaQuest3: unknown;
          };
        }
      ).IWER;
      if (!iwerGlobal) {
        throw new Error('IWER bundle did not attach window.IWER');
      }
      const xrDevice = new iwerGlobal.XRDevice(iwerGlobal.metaQuest3);
      xrDevice.installRuntime({ forceInstall: true });
      xrDevice.primaryInputMode = 'hand';
      (window as unknown as Record<string, unknown>).__xrDevice = xrDevice;
    });

    const separator = targetUrl.includes('?') ? '&' : '?';
    const flaggedUrl = `${targetUrl}${separator}debug=1`;

    const response = await page.goto(flaggedUrl, { waitUntil: 'networkidle' });
    expect(response?.status()).toBeLessThan(400);

    const enterVrButton = page.getByTestId('enter-vr-button');
    await expect(enterVrButton).toHaveText('Enter VR');
    await enterVrButton.click();
    await expect(enterVrButton).toHaveText('Exit VR');

    const debugHud = page.getByTestId('debug-hud');
    await expect(debugHud).toBeVisible();

    // Wait for XR hand tracking to become TRACKED and local hand GLBs to finish loading
    await expect
      .poll(
        async () => {
          return page.evaluate(() => window.__talkingDrumRuntime?.handState ?? 'UNTRACKED');
        },
        { timeout: 5000 },
      )
      .toBe('TRACKED');

    const strikeResults = await page.evaluate(async () => {
      interface Vec3 {
        x: number;
        y: number;
        z: number;
      }
      const xrDevice = (
        window as unknown as {
          __xrDevice: {
            hands: {
              right: {
                position: { set: (x: number, y: number, z: number) => void };
                quaternion: { set: (x: number, y: number, z: number, w: number) => void };
              };
            };
          };
        }
      ).__xrDevice;
      const runtime = window.__talkingDrumRuntime!;
      const hudEl = document.getElementById('xr-debug-hud')!;

      const nextFrame = () =>
        new Promise<number>((resolve) => window.requestAnimationFrame(resolve));

      // Calibrate the exact offset between xrDevice.hands.right.position (IWER globalSpace)
      // and HandTracker's palm midpoint in world.xrReferenceSpace by sampling at (0, 0, 0).
      xrDevice.hands.right.quaternion.set(0, 0, 0, 1);
      xrDevice.hands.right.position.set(0, 0, 0);
      await nextFrame();
      await nextFrame();
      const palmOffset: Vec3 = {
        x: runtime.rawWorld.x,
        y: runtime.rawWorld.y,
        z: runtime.rawWorld.z,
      };

      const halfLength = 0.19;
      const tiltRad = (30 * Math.PI) / 180;
      const cosTilt = Math.cos(tiltRad);
      const sinTilt = Math.sin(tiltRad);

      const setPalmDrumLocal = (localX: number, signedSkinHeightMeters: number, localZ: number) => {
        const localY = halfLength + signedSkinHeightMeters;
        const drumPos = runtime.drumWorldPosition;
        const worldX = drumPos.x + localX;
        const worldY = drumPos.y + localY * cosTilt - localZ * sinTilt;
        const worldZ = drumPos.z + localY * sinTilt + localZ * cosTilt;
        xrDevice.hands.right.position.set(
          worldX - palmOffset.x,
          worldY - palmOffset.y,
          worldZ - palmOffset.z,
        );
      };

      const stepFramesWithPose = async (
        frames: number,
        localX: number,
        signedSkinHeightMeters: number,
        localZ: number,
      ) => {
        for (let i = 0; i < frames; i += 1) {
          setPalmDrumLocal(localX, signedSkinHeightMeters, localZ);
          await nextFrame();
        }
      };

      // Settle above the drumhead centre (+0.06 m above skin plane) for 6 frames
      await stepFramesWithPose(6, 0, 0.06, 0);
      const countBeforeFastStrike = Number(hudEl.dataset.strikeCount ?? '0');

      // (a) Fast downward strike through the head centre (+0.06 m -> +0.025 m -> -0.020 m)
      await stepFramesWithPose(1, 0, 0.025, 0);
      await stepFramesWithPose(3, 0, -0.02, 0);
      const countAfterFastStrike = Number(hudEl.dataset.strikeCount ?? '0');
      const hudTextAfterFastStrike = hudEl.textContent ?? '';

      // Wait > 120 ms (exceeding debounceMs = 90 ms) and re-arm at +0.04 m above skin plane
      const rearmStart = performance.now();
      while (performance.now() - rearmStart < 140) {
        setPalmDrumLocal(0, 0.04, 0);
        await nextFrame();
      }

      // (b1) Slow descent through head centre at 0.08 m/s (< 0.30 m/s threshold)
      const slowStart = performance.now();
      while (true) {
        const elapsedSec = (performance.now() - slowStart) / 1000;
        const h = 0.04 - 0.08 * elapsedSec;
        setPalmDrumLocal(0, h, 0);
        await nextFrame();
        if (h <= -0.015) {
          break;
        }
      }
      const countAfterSlowDescent = Number(hudEl.dataset.strikeCount ?? '0');

      // Re-arm at off-rim position (localX = 0.17 m > 0.12 m max hit radius, +0.06 m above skin plane)
      await stepFramesWithPose(6, 0.17, 0.06, 0);

      // (b2) Fast downward strike outside the rim (localX = 0.17 m)
      await stepFramesWithPose(1, 0.17, 0.025, 0);
      await stepFramesWithPose(3, 0.17, -0.02, 0);
      const countAfterRimMiss = Number(hudEl.dataset.strikeCount ?? '0');

      // Re-arm just above rearmDistanceMeters (+0.010 m >= 0.008 m, but < minApproachTravelMeters = 0.020 m)
      // and hold for 180 ms (> approachWindowMs = 150 ms) so no sample >= 0.020 m remains in the window
      const hoverStart = performance.now();
      while (performance.now() - hoverStart < 180) {
        setPalmDrumLocal(0, 0.01, 0);
        await nextFrame();
      }

      // (b3) Jitter at the skin plane (+/- 2.5 mm across the plane over 12 frames)
      for (let i = 0; i < 12; i += 1) {
        const jitterHeight = i % 2 === 0 ? 0.0025 : -0.0025;
        setPalmDrumLocal(0, jitterHeight, 0);
        await nextFrame();
      }
      const countAfterPlaneJitter = Number(hudEl.dataset.strikeCount ?? '0');

      return {
        countBeforeFastStrike,
        countAfterFastStrike,
        countAfterSlowDescent,
        countAfterRimMiss,
        countAfterPlaneJitter,
        hudTextAfterFastStrike,
        lastSpeedMps: runtime.lastStrikeSpeedMps,
        lastRadialMeters: runtime.lastStrikeRadialMeters,
      };
    });

    expect(strikeResults.countBeforeFastStrike).toBe(0);
    expect(strikeResults.countAfterFastStrike).toBe(1);
    expect(strikeResults.hudTextAfterFastStrike).toContain('hand(right): TRACKED');
    expect(strikeResults.hudTextAfterFastStrike).toContain('strikes: 1');
    expect(strikeResults.lastSpeedMps).toBeGreaterThanOrEqual(0.3);
    expect(strikeResults.lastRadialMeters).toBeLessThan(0.01);

    // Slow descent, rim miss, and plane jitter must all produce 0 hits
    expect(strikeResults.countAfterSlowDescent).toBe(1);
    expect(strikeResults.countAfterRimMiss).toBe(1);
    expect(strikeResults.countAfterPlaneJitter).toBe(1);

    const allRequestUrls = trackedRequests
      .map((req) => req.url())
      .filter((u) => !u.startsWith('data:') && !u.startsWith('blob:'));
    expect(
      allRequestUrls.some((u) => u.endsWith('/xr-profiles/generic-hand/left.glb')),
      'Expected local generic-hand/left.glb to be requested',
    ).toBe(true);
    expect(
      allRequestUrls.some((u) => u.endsWith('/xr-profiles/generic-hand/right.glb')),
      'Expected local generic-hand/right.glb to be requested',
    ).toBe(true);

    const thirdPartyRequests = collectThirdPartyRequests(trackedRequests, response, page.url());

    expect(
      thirdPartyRequests,
      `Disallowed third-party requests during XR hand session: ${thirdPartyRequests.join(', ')}`,
    ).toEqual([]);
    expect(badStatusResponses, `HTTP >= 400 responses: ${badStatusResponses.join(', ')}`).toEqual(
      [],
    );
    expect(failedRequests, `Failed network requests: ${failedRequests.join(', ')}`).toEqual([]);
    expect(consoleErrors, `Console/page errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('starts immersive-vr session with injected IWER in controller mode with zero third-party requests and zero console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const badStatusResponses: string[] = [];
    const trackedRequests: import('@playwright/test').Request[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });
    page.on('request', (request) => {
      trackedRequests.push(request);
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'unknown';
      failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        badStatusResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.addInitScript({ path: iwerBundlePath });
    await page.addInitScript(() => {
      const iwerGlobal = (
        window as unknown as {
          IWER?: {
            XRDevice: new (config: unknown) => {
              installRuntime: (opts?: { forceInstall?: boolean }) => void;
              primaryInputMode: 'controller' | 'hand';
            };
            metaQuest3: unknown;
          };
        }
      ).IWER;
      if (!iwerGlobal) {
        throw new Error('IWER bundle did not attach window.IWER');
      }
      const xrDevice = new iwerGlobal.XRDevice(iwerGlobal.metaQuest3);
      xrDevice.installRuntime({ forceInstall: true });
      xrDevice.primaryInputMode = 'controller';
      (window as unknown as Record<string, unknown>).__xrDevice = xrDevice;
    });

    const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
    expect(response?.status()).toBeLessThan(400);

    const enterVrButton = page.getByTestId('enter-vr-button');
    await expect(enterVrButton).toHaveText('Enter VR');
    await enterVrButton.click();

    await expect(enterVrButton).toHaveText('Exit VR');
    await page.waitForTimeout(1000);

    const thirdPartyRequests = collectThirdPartyRequests(trackedRequests, response, page.url());

    expect(
      thirdPartyRequests,
      `Disallowed third-party requests during XR controller session: ${thirdPartyRequests.join(', ')}`,
    ).toEqual([]);
    expect(badStatusResponses, `HTTP >= 400 responses: ${badStatusResponses.join(', ')}`).toEqual(
      [],
    );
    expect(failedRequests, `Failed network requests: ${failedRequests.join(', ')}`).toEqual([]);
    expect(consoleErrors, `Console/page errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });
});
