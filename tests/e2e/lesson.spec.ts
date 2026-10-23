import { expect, type Page, test } from '@playwright/test';
import {
  enterVrWithIwerHands,
  pitchState,
  rightHandStrike,
  setLeftPose,
  trackErrors,
} from './iwer-hands.js';

/**
 * P2b lesson e2e in IWER hand mode. Limits: IWER has no fist pose, so with default squeeze limits
 * (?calib=0) the left hand can produce only band L (`default` pose) and band M (`point` pose).
 * Band H needs a calibration (point -> H) and then M is unreachable, so these runs use L1 phrases
 * with L and M targets; every other transition is covered by the reducer unit tests.
 */

interface LessonDiag {
  phase: string;
  phraseId: string;
  attempt: number;
  lastResult: string;
  feedback: string;
  strikes: string;
  stars: Record<string, number>;
  history: string[];
  demosStarted: number;
  demoVoicesScheduled: number;
  demoIndex: number;
  fontStatus: string;
}

async function lesson(page: Page): Promise<LessonDiag> {
  return page.evaluate(() => {
    const d = (window as unknown as { __talkingDrumLesson: LessonDiag }).__talkingDrumLesson;
    return { ...d, stars: { ...d.stars }, history: [...d.history] };
  });
}

async function waitForPhase(page: Page, phase: string, timeout = 15_000): Promise<void> {
  await expect.poll(async () => (await lesson(page)).phase, { timeout }).toBe(phase);
}

async function strike(page: Page): Promise<void> {
  expect(await rightHandStrike(page), 'scripted right-hand strike registered').toBe(true);
}

async function startLesson(page: Page, query: string, pose: 'default' | 'point', band: string) {
  await enterVrWithIwerHands(page, query);
  await expect
    .poll(async () => (await pitchState(page)).tracking, { timeout: 5000 })
    .toBe('TRACKED');
  await setLeftPose(page, pose);
  await expect.poll(async () => (await pitchState(page)).band, { timeout: 3000 }).toBe(band);
  expect((await lesson(page)).phase).toBe('TITLE');
  await strike(page); // "Strike the drum to begin"
  await waitForPhase(page, 'YOUR_TURN');
}

test.describe('Talking Drum VR — P2b lesson (IWER hands)', () => {
  test('one scripted lesson pass: echo a mid tone on the first try for 3 stars', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await startLesson(page, 'debug=1&calib=0&lesson=l1-m', 'point', 'M');

    const before = await lesson(page);
    expect(before.phraseId).toBe('l1-m');
    expect(before.history).toEqual(['TITLE', 'CALIBRATION', 'LEVEL_INTRO', 'DEMO', 'YOUR_TURN']);
    expect(before.demosStarted).toBe(1);
    expect(before.demoVoicesScheduled).toBe(1);
    const audio = await page.evaluate(() => ({ ...window.__talkingDrumAudio! }));
    expect(audio.scheduledVoices).toBe(1);

    await strike(page);
    await expect.poll(async () => (await lesson(page)).feedback).toBe('correct');
    const done = await lesson(page);
    expect(done.lastResult).toBe('correct');
    expect(done.stars['l1-m']).toBe(3);
    await expect(page.getByTestId('debug-hud-lesson')).toContainText('phrase l1-m');
    await expect(page.getByTestId('debug-hud-lesson')).toContainText('last correct');

    // After the feedback pause the next phrase's demo starts.
    await expect.poll(async () => (await lesson(page)).phraseId, { timeout: 8000 }).toBe('l1-h');
    const next = await lesson(page);
    expect(next.history).toEqual(expect.arrayContaining(['EVALUATE', 'FEEDBACK', 'DEMO']));
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('wrong then right: a mid strike for a low target retries, the low echo earns 2 stars', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await startLesson(page, 'debug=1&calib=0&lesson=l1-l', 'point', 'M');
    expect((await lesson(page)).phraseId).toBe('l1-l');

    await strike(page); // band M, target L
    await expect.poll(async () => (await lesson(page)).feedback).toBe('retry');
    expect((await lesson(page)).lastResult).toBe('wrong');
    await expect(page.getByTestId('debug-hud-lesson')).toContainText('last wrong');

    // The retry replays the demo, then a second "Your turn".
    await expect.poll(async () => (await lesson(page)).attempt, { timeout: 8000 }).toBe(2);
    await waitForPhase(page, 'YOUR_TURN');
    expect((await lesson(page)).demosStarted).toBe(2);

    await setLeftPose(page, 'default');
    await expect.poll(async () => (await pitchState(page)).band, { timeout: 3000 }).toBe('L');
    await strike(page);
    await expect.poll(async () => (await lesson(page)).feedback).toBe('correct');
    expect((await lesson(page)).stars['l1-l']).toBe(2);
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('the panel font renders Yoruba letters and tone marks (precomposed and combining)', async ({
    page,
  }, testInfo) => {
    const errors = trackErrors(page);
    await page.goto(`./?debug=1&lesson=l3-e-kaabo`, { waitUntil: 'networkidle' });
    await expect
      .poll(() => page.evaluate(() => window.__talkingDrumLessonPanel?.fontStatus()))
      .toBe('loaded');

    // Each pair: the NFC (precomposed where Unicode has one) form, then a fully decomposed form.
    const pairs = ['ẹ ọ ṣ Ẹ Ọ Ṣ', 'à á è é ì í ò ó ù ú', 'ọ́ ọ̀ ẹ́ ẹ̀ Ọ́ Ẹ̀', 'Ẹ káàbọ̀ · Ó dàbọ̀ · ọ̀kọ̀'];
    const result = await page.evaluate((nfcLines) => {
      const panel = window.__talkingDrumLessonPanel!;
      const nfd = nfcLines.map((l) => l.normalize('NFD'));
      const composedUrl = panel.drawSpecimen(nfcLines);
      const decomposedUrl = panel.drawSpecimen(nfd);
      const specimenUrl = panel.drawSpecimen(
        nfcLines.flatMap((l, i) => [`${l}   (NFC)`, `${nfd[i]}   (NFD)`]),
      );
      return {
        same: composedUrl === decomposedUrl,
        decomposedDiffers: nfd.some((l, i) => l !== nfcLines[i]),
        fontCheck: document.fonts.check('48px LessonSans', nfcLines.join(' ')),
        specimenUrl,
      };
    }, pairs);

    const png = Buffer.from(result.specimenUrl.split(',')[1], 'base64');
    await testInfo.attach('yoruba-diacritics-specimen.png', {
      body: png,
      contentType: 'image/png',
    });
    await page.screenshot({ path: testInfo.outputPath('page.png') });

    expect(result.decomposedDiffers).toBe(true);
    expect(result.fontCheck).toBe(true);
    // Shaping with the bundled font draws both encodings identically.
    expect(result.same).toBe(true);
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
