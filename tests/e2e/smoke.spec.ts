import path from 'node:path';
import { expect, test } from '@playwright/test';

const rawBasePath = process.env.BASE_PATH ?? '/';
const normalizedBasePath = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`;
const defaultPreviewUrl = `https://localhost:4173${normalizedBasePath.endsWith('/') ? normalizedBasePath : `${normalizedBasePath}/`}`;
const targetUrl = process.env.LIVE_URL ?? defaultPreviewUrl;
const iwerBundlePath = path.resolve(process.cwd(), 'node_modules/iwer/build/iwer.min.js');

const EXPECTED_CONTROLLERS_ONLY_MESSAGE =
  'Only controllers are active — please put your controllers down and enable hand tracking to play the talking drum.';

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

    // Loading banner ships in the static HTML (visible at first paint, before any JS runs)...
    const initialHtml = (await response?.text()) ?? '';
    expect(initialHtml).toMatch(/<div[^>]*id="app-loading-banner"[^>]*role="status"/);
    expect(initialHtml).toContain('Loading Talking Drum VR');
    // ...and is removed once World.create() resolves.
    await expect(page.getByTestId('app-loading-banner')).toHaveCount(0);

    await expect(page).toHaveTitle(/Talking Drum VR/i);

    // The placeholder drum voice renders at startup without creating an AudioContext
    // (no user gesture yet), and is not silent.
    await expect
      .poll(async () => page.evaluate(() => window.__talkingDrumAudio?.bufferReady ?? false))
      .toBe(true);
    const audioAtLoad = await page.evaluate(() => window.__talkingDrumAudio);
    expect(audioAtLoad?.contextState).toBe('no-context');
    expect(audioAtLoad?.bufferDurationSec).toBeCloseTo(0.65, 2);
    expect(audioAtLoad?.bufferPeak).toBeGreaterThan(0.05);

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
    const audioProbe = page.getByTestId('debug-hud-audio');
    await expect(audioProbe).toContainText('software + audio buffer estimate');
    await expect(audioProbe).toContainText('not tracking / end-to-end latency');
    await expect(audioProbe).toContainText('pipeline n/a');
    await expect(audioProbe).toContainText('voices started 0');

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
    // calib=0: this is the strike test; squeeze calibration has its own e2e (squeeze.spec.ts).
    const flaggedUrl = `${targetUrl}${separator}debug=1&calib=0`;

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

      const frameTimesMs: number[] = [];
      const nextFrame = () =>
        new Promise<number>((resolve) =>
          window.requestAnimationFrame((t) => {
            frameTimesMs.push(t);
            resolve(t);
          }),
        );

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

      // (a) Fast downward strike through the head centre (+0.06 m -> +0.025 m -> -0.020 m).
      // The detector's gates are real-time (>= 0.30 m/s, >= 2 cm wind-up within 150 ms), but
      // headless SwiftShader paces frames at ~100 ms with occasional 180-200 ms spikes. A 0.045 m
      // step across a >150 ms frame really is a slow motion, so the detector correctly ignores
      // it. Only such slow-frame attempts are retried (after re-arming); a miss on a normal frame
      // fails the test.
      const slowFrameMs = 140;
      const maxStrikeAttempts = 4;
      const strikeAttempts: Array<{ intervalsMs: number[]; hit: boolean }> = [];
      let strikeFrameIntervalsMs: number[] = [];
      for (let attempt = 0; attempt < maxStrikeAttempts; attempt += 1) {
        if (attempt > 0) {
          const rearmAt = performance.now();
          while (performance.now() - rearmAt < 160) {
            setPalmDrumLocal(0, 0.06, 0);
            await nextFrame();
          }
        }
        const before = Number(hudEl.dataset.strikeCount ?? '0');
        const strikeFrameIndex = frameTimesMs.length;
        await stepFramesWithPose(1, 0, 0.025, 0);
        await stepFramesWithPose(3, 0, -0.02, 0);
        strikeFrameIntervalsMs = frameTimesMs
          .slice(strikeFrameIndex, strikeFrameIndex + 4)
          .map((t, i, arr) => (i === 0 ? 0 : Math.round(t - arr[i - 1])))
          .slice(1);
        const hit = Number(hudEl.dataset.strikeCount ?? '0') > before;
        strikeAttempts.push({ intervalsMs: strikeFrameIntervalsMs, hit });
        const crossingWasSlow = strikeFrameIntervalsMs.slice(0, 2).some((dt) => dt > slowFrameMs);
        if (hit || !crossingWasSlow) {
          break;
        }
      }
      const countAfterFastStrike = Number(hudEl.dataset.strikeCount ?? '0');
      const hudTextAfterFastStrike = hudEl.textContent ?? '';
      const audioAfterFastStrike = { ...window.__talkingDrumAudio! };
      const pitchAfterFastStrike = { ...window.__talkingDrumPitch! };
      const audioProbeTextAfterFastStrike =
        document.querySelector('[data-testid="debug-hud-audio"]')?.textContent ?? '';

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
        strikeAttempts,
        strikeFrameIntervalsMs,
        audioAfterFastStrike,
        audioProbeTextAfterFastStrike,
        voicesAtEnd: window.__talkingDrumAudio?.voicesStartedCount ?? -1,
        pitchAfterFastStrike,
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

    console.log(`[e2e] fast-strike attempts: ${JSON.stringify(strikeResults.strikeAttempts)}`);
    expect(strikeResults.countBeforeFastStrike).toBe(0);
    expect(
      strikeResults.countAfterFastStrike,
      `fast-strike attempts (frame intervals ms / hit): ${JSON.stringify(strikeResults.strikeAttempts)}`,
    ).toBe(1);
    expect(strikeResults.hudTextAfterFastStrike).toContain('hand(right): TRACKED');
    expect(strikeResults.hudTextAfterFastStrike).toContain('strikes: 1');
    expect(strikeResults.lastSpeedMps).toBeGreaterThanOrEqual(0.3);
    expect(strikeResults.lastRadialMeters).toBeLessThan(0.01);

    // Slow descent, rim miss, and plane jitter must all produce 0 hits
    expect(strikeResults.countAfterSlowDescent).toBe(1);
    expect(strikeResults.countAfterRimMiss).toBe(1);
    expect(strikeResults.countAfterPlaneJitter).toBe(1);

    // The hit reached DrumAudio.play(): the Enter VR click unlocked the AudioContext, so it was
    // already 'running' at the first strike, and exactly one voice started (none for the misses).
    expect(strikeResults.audioAfterFastStrike.contextStateAtFirstStrike).toBe('running');
    expect(strikeResults.audioAfterFastStrike.contextState).toBe('running');
    expect(strikeResults.audioAfterFastStrike.voicesStartedCount).toBe(1);
    expect(strikeResults.audioAfterFastStrike.lastOutcome).toBe('played');
    // The strike plays at the pitch-hand ratio latched on the strike frame (P2a), within 0.75..1.33.
    expect(strikeResults.pitchAfterFastStrike.strikesLatched).toBe(1);
    expect(strikeResults.audioAfterFastStrike.lastPlaybackRate).toBeCloseTo(
      strikeResults.pitchAfterFastStrike.latchedPitchRatio,
      9,
    );
    expect(strikeResults.audioAfterFastStrike.lastPlaybackRate).toBeGreaterThanOrEqual(0.75);
    expect(strikeResults.audioAfterFastStrike.lastPlaybackRate).toBeLessThanOrEqual(1.33);
    expect(strikeResults.audioAfterFastStrike.lastGain).toBeGreaterThanOrEqual(0.15);
    expect(strikeResults.audioAfterFastStrike.lastGain).toBeLessThanOrEqual(1);
    expect(Number.isFinite(strikeResults.audioAfterFastStrike.lastSoftwarePipelineMs)).toBe(true);
    expect(strikeResults.audioAfterFastStrike.lastSoftwarePipelineMs).toBeGreaterThanOrEqual(0);
    expect(strikeResults.audioProbeTextAfterFastStrike).toMatch(/pipeline \d+\.\d{2} ms/);
    expect(strikeResults.audioProbeTextAfterFastStrike).toContain('voices started 1');
    expect(strikeResults.audioProbeTextAfterFastStrike).toMatch(
      /max pipeline \(5 s\) \d+\.\d{2} ms/,
    );
    expect(strikeResults.audioProbeTextAfterFastStrike).toMatch(/max frame gap \(5 s\) \d+\.\d ms/);
    expect(strikeResults.audioProbeTextAfterFastStrike).toContain(
      'skipped no-context 0 / not-running 0 / no-buffer 0 / invalid 0',
    );
    expect(strikeResults.voicesAtEnd).toBe(1);
    // Hands are tracked, so the controller-only notice never appears.
    await expect(page.getByTestId('vr-status-message')).toBeHidden();

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

    // No hand input appears, so after the grace period the controller-only notice is shown.
    const statusMessage = page.getByTestId('vr-status-message');
    await expect(statusMessage).toBeVisible({ timeout: 8000 });
    await expect(statusMessage).toHaveText(EXPECTED_CONTROLLERS_ONLY_MESSAGE);

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
