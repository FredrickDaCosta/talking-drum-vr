import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { trackErrors } from './iwer-hands.js';
import { lesson, waitForPhase } from './lesson-helpers.js';

/**
 * P3 desktop play mode in plain (non-XR) Chromium: headless Chromium reports immersive-vr as
 * unsupported, so the page starts in desktop mode by itself. One full lesson phrase is played with
 * mouse clicks on the drum head and the on-screen pitch buttons; keyboard and the VR-capable offer
 * are covered too.
 */

const EVIDENCE = process.env.P3_EVIDENCE_DIR;
const iwerBundlePath = path.resolve(process.cwd(), 'node_modules/iwer/build/iwer.min.js');

interface DesktopDiag {
  mode: string;
  xrSupported: boolean;
  active: boolean;
  band: string;
  strikes: number;
  misses: number;
  headScreen: { x: number; y: number };
}

async function desktop(page: Page): Promise<DesktopDiag> {
  return page.evaluate(
    () => JSON.parse(JSON.stringify(window.__talkingDrumDesktop)) as DesktopDiag,
  );
}

function trackThirdParty(page: Page): string[] {
  const third: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (
      !['localhost', '127.0.0.1', 'drum.da-costa.online', 'fredrickdacosta.github.io'].includes(
        url.hostname,
      ) &&
      url.protocol.startsWith('http')
    ) {
      third.push(req.url());
    }
  });
  return third;
}

async function clickDrum(page: Page): Promise<void> {
  const before = (await desktop(page)).strikes;
  const { headScreen } = await desktop(page);
  await page.mouse.click(headScreen.x, headScreen.y);
  await expect.poll(async () => (await desktop(page)).strikes).toBe(before + 1);
}

test.describe('Talking Drum VR — P3 desktop play mode (no headset)', () => {
  test('starts in desktop mode without WebXR and plays one phrase with clicks and pitch buttons', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = trackErrors(page);
    const third = trackThirdParty(page);
    await page.goto('./?debug=1&lesson=l1-h-l', { waitUntil: 'networkidle' });

    await expect.poll(async () => (await desktop(page)).mode).toBe('desktop');
    const d0 = await desktop(page);
    expect(d0).toMatchObject({ xrSupported: false, active: true, band: 'M' });
    await expect(page.getByTestId('desktop-controls')).toBeVisible();
    await expect(page.getByTestId('desktop-controls')).toContainText(
      'Click the drum to strike. Choose Low, Mid or High to change the pitch.',
    );
    await expect(page.getByTestId('desktop-key-hint')).toBeVisible();
    await expect(page.getByTestId('enter-vr-button')).toBeVisible(); // still offered, secondary
    await expect(page.getByTestId('play-without-headset')).toBeHidden();
    expect(await page.evaluate(() => window.__talkingDrumUi?.welcomePanelVisible)).toBe(false);
    expect(await page.evaluate(() => window.__talkingDrumPitch!.calibration)).toBe('skipped');

    // A click away from the drum does nothing; audio is not created before a gesture.
    expect(await page.evaluate(() => window.__talkingDrumAudio!.contextState)).toBe('no-context');
    await page.mouse.click(30, 30);
    expect((await desktop(page)).misses).toBe(1);
    expect((await lesson(page)).phase).toBe('TITLE');
    await expect.poll(async () => (await lesson(page)).fontStatus).toBe('loaded');
    if (EVIDENCE) {
      fs.mkdirSync(EVIDENCE, { recursive: true });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${EVIDENCE}/p3-desktop-title-1280.png` });
    }

    // Strike to begin (the first click also unlocks audio and is heard).
    await clickDrum(page);
    await waitForPhase(page, 'YOUR_TURN', 15_000);
    const audio = await page.evaluate(() => ({ ...window.__talkingDrumAudio! }));
    expect(audio.contextState).toBe('running');
    expect(audio.voicesStartedCount).toBe(1);
    expect(audio.scheduledVoices).toBe(2); // the H L demo on the audio clock
    expect((await lesson(page)).history).toEqual([
      'TITLE',
      'CALIBRATION',
      'LEVEL_INTRO',
      'DEMO',
      'YOUR_TURN',
    ]);

    // Echo H then L with the pitch buttons; each strike latches the band chosen before it.
    await page.getByTestId('pitch-high').click();
    await expect(page.getByTestId('pitch-high')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__talkingDrumPitch!.band)).toBe('H');
    await clickDrum(page);
    expect(await page.evaluate(() => window.__talkingDrumPitch!.latchedBand)).toBe('H');
    expect(await page.evaluate(() => window.__talkingDrumAudio!.lastPlaybackRate)).toBeCloseTo(
      1.33,
      5,
    );
    await page.getByTestId('pitch-low').click();
    await clickDrum(page);
    await expect.poll(async () => (await lesson(page)).feedback).toBe('correct');
    const done = await lesson(page);
    expect(done.strikes).toBe('H,L');
    expect(done.stars['l1-h-l']).toBe(3);
    if (EVIDENCE) {
      await page.screenshot({ path: `${EVIDENCE}/p3-desktop-correct-1280.png` });
    }
    expect(third, `Third-party requests: ${third.join(', ')}`).toEqual([]);
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('keyboard: 1 2 3 / Q W E choose the pitch and Space strikes', async ({ page }) => {
    test.setTimeout(45_000);
    const errors = trackErrors(page);
    await page.goto('./?lesson=l1-h', { waitUntil: 'networkidle' });
    await expect.poll(async () => (await desktop(page)).active).toBe(true);
    await page.keyboard.press('Space'); // begin
    await waitForPhase(page, 'YOUR_TURN', 15_000);
    await page.keyboard.press('Digit1');
    expect((await desktop(page)).band).toBe('L');
    await page.keyboard.press('KeyE');
    expect((await desktop(page)).band).toBe('H');
    await expect(page.getByTestId('pitch-high')).toHaveAttribute('aria-pressed', 'true');
    if (EVIDENCE) {
      fs.mkdirSync(EVIDENCE, { recursive: true });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${EVIDENCE}/p3-desktop-your-turn-1280.png` });
    }
    await page.keyboard.press('Space');
    await expect.poll(async () => (await lesson(page)).feedback).toBe('correct');
    expect((await lesson(page)).stars['l1-h']).toBe(3);
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('phone-size viewport: controls fit and tap targets are at least 44 px', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    const errors = trackErrors(page);
    await page.goto('./', { waitUntil: 'networkidle' });
    await expect.poll(async () => (await desktop(page)).active).toBe(true);
    for (const id of ['pitch-low', 'pitch-mid', 'pitch-high', 'enter-vr-button']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.height, `${id} height`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${id} width`).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    // A tap on the drum head strikes.
    const { headScreen } = await desktop(page);
    await page.touchscreen.tap(headScreen.x, headScreen.y);
    await expect.poll(async () => (await desktop(page)).strikes).toBe(1);
    await expect.poll(async () => (await lesson(page)).phase).not.toBe('TITLE');
    if (EVIDENCE) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${EVIDENCE}/p3-desktop-phone-390.png` });
    }
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
    await context.close();
  });

  test('VR-capable browser: VR stays primary; "Play without a headset" and ?mode=desktop switch', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.addInitScript({ path: iwerBundlePath });
    await page.addInitScript(() => {
      const iwer = (
        window as unknown as {
          IWER: {
            XRDevice: new (c: unknown) => {
              installRuntime: (o?: { forceInstall?: boolean }) => void;
            };
            metaQuest3: unknown;
          };
        }
      ).IWER;
      new iwer.XRDevice(iwer.metaQuest3).installRuntime({ forceInstall: true });
    });
    await page.goto('./', { waitUntil: 'networkidle' });
    await expect.poll(async () => (await desktop(page)).mode).toBe('vr');
    expect((await desktop(page)).xrSupported).toBe(true);
    expect((await desktop(page)).active).toBe(false);
    await expect(page.getByTestId('desktop-controls')).toBeHidden();
    const offer = page.getByTestId('play-without-headset');
    await expect(offer).toBeVisible();
    // Enter VR comes first.
    const vrBox = (await page.getByTestId('enter-vr-button').boundingBox())!;
    const offerBox = (await offer.boundingBox())!;
    expect(vrBox.y).toBeLessThan(offerBox.y);

    await offer.click();
    await expect.poll(async () => (await desktop(page)).active).toBe(true);
    await expect(page.getByTestId('desktop-controls')).toBeVisible();
    await expect(offer).toBeHidden();

    // ?mode=desktop forces it on a VR-capable browser too.
    await page.goto('./?mode=desktop', { waitUntil: 'networkidle' });
    await expect.poll(async () => (await desktop(page)).mode).toBe('desktop');
    expect((await desktop(page)).xrSupported).toBe(true);
    await expect(page.getByTestId('enter-vr-button')).toBeVisible();
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
