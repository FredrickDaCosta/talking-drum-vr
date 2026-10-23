import fs from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { APP_CONFIG } from '../../src/app/config.js';
import { enterVrWithIwerHands, pitchState, setLeftPose, trackErrors } from './iwer-hands.js';
import { lesson, startLesson, strike, waitForPhase } from './lesson-helpers.js';

/**
 * P2c flow e2e in IWER hand mode: title screen and welcome panel, feedback cues, a strike during a
 * demo, a hidden tab during a demo, the END screen and "strike to play again", and an XR session
 * ending mid-lesson. Panel images are written to test-results for the PR evidence.
 */

const EVIDENCE = process.env.P2C_EVIDENCE_DIR;

async function panelPng(page: Page, name: string): Promise<void> {
  const url = await page.evaluate(() => window.__talkingDrumLessonPanel!.canvas.toDataURL());
  const png = Buffer.from(url.split(',')[1], 'base64');
  await test.info().attach(name, { body: png, contentType: 'image/png' });
  if (EVIDENCE) {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    fs.writeFileSync(`${EVIDENCE}/${name}`, png);
  }
}

async function setDocumentHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (h ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('Talking Drum VR — P2c lesson flow (IWER hands)', () => {
  test('title screen in XR replaces the welcome panel; the correct chime is quieter than the drum', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await enterVrWithIwerHands(page, 'debug=1&calib=0&lesson=l1-m');
    await expect
      .poll(() => page.evaluate(() => window.__talkingDrumUi?.welcomePanelVisible))
      .toBe(false);
    await expect.poll(async () => (await lesson(page)).fontStatus).toBe('loaded');
    expect((await lesson(page)).phase).toBe('TITLE');
    await page.waitForTimeout(300);
    await panelPng(page, 'p2c-title-panel.png');
    if (EVIDENCE) {
      await page.screenshot({ path: `${EVIDENCE}/p2c-title-xr-view.png` });
    }

    await expect
      .poll(async () => (await pitchState(page)).tracking, { timeout: 5000 })
      .toBe('TRACKED');
    await setLeftPose(page, 'point');
    await expect.poll(async () => (await pitchState(page)).band, { timeout: 3000 }).toBe('M');
    await strike(page);
    await waitForPhase(page, 'YOUR_TURN');
    await strike(page);
    await expect.poll(async () => (await lesson(page)).feedback).toBe('correct');
    expect((await lesson(page)).cuesPlayed).toBe(1);

    const audio = await page.evaluate(() => ({ ...window.__talkingDrumAudio! }));
    expect(audio.cuesReady).toBe(true);
    expect(audio.cuesPlayed).toBe(1);
    // Loudest cue sample at cue gain < softest drum hit's peak (min gain), from the rendered buffers.
    const cuePeak = Math.max(audio.cuePeaks.correct, audio.cuePeaks.retry);
    console.log(
      `[e2e] cue level ${(APP_CONFIG.audio.cueGain * cuePeak).toFixed(3)} vs softest drum ${(APP_CONFIG.audio.minGain * audio.bufferPeak).toFixed(3)}`,
    );
    expect(APP_CONFIG.audio.cueGain * cuePeak).toBeLessThan(
      APP_CONFIG.audio.minGain * audio.bufferPeak,
    );

    // Leaving XR shows the welcome panel again.
    await page.getByTestId('enter-vr-button').click();
    await expect(page.getByTestId('enter-vr-button')).toHaveText('Enter VR');
    await expect
      .poll(() => page.evaluate(() => window.__talkingDrumUi?.welcomePanelVisible))
      .toBe(true);
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('a strike during the demo is ignored; a hidden tab stops and restarts the demo', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = trackErrors(page);
    await enterVrWithIwerHands(page, 'debug=1&calib=0&lesson=l3-e-kaabo');
    await expect
      .poll(async () => (await pitchState(page)).tracking, { timeout: 5000 })
      .toBe('TRACKED');
    await strike(page); // begin
    await waitForPhase(page, 'DEMO');
    // The 4-syllable demo lasts 2.55 s plus a 0.7 s pause: strike inside it.
    await strike(page);
    const during = await lesson(page);
    expect(during.ignoredStrikes).toBe(1);
    expect(during.strikes).toBe('');

    // Next demo: hide the tab mid-demo. Voices stop, the state freezes, and the demo restarts.
    await waitForPhase(page, 'YOUR_TURN');
    expect((await lesson(page)).strikes).toBe('');
    // No strike: after idleReplayMs (10 s) the demo replays without costing a try.
    await waitForPhase(page, 'DEMO', 15_000);
    const demosBefore = (await lesson(page)).demosStarted;
    await setDocumentHidden(page, true);
    const hidden = await page.evaluate(() => ({
      lesson: { ...window.__talkingDrumLesson! },
      audio: { ...window.__talkingDrumAudio! },
    }));
    expect(hidden.lesson.interruptions).toBe(1);
    expect(hidden.audio.scheduledStopped).toBeGreaterThan(0);
    await page.waitForTimeout(4000); // longer than the demo: frozen, not advanced
    expect((await lesson(page)).phase).toBe('DEMO');
    await setDocumentHidden(page, false);
    await expect.poll(async () => (await lesson(page)).demosStarted).toBe(demosBefore + 1);
    await waitForPhase(page, 'YOUR_TURN');
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('END screen, then "strike to play again" restarts cleanly without a reload', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const errors = trackErrors(page);
    // The last phrase of the session (M H L L). With ?calib=0 only L and M are reachable, so the
    // run misses three times (one strike per try, ended by the 4 s gap), hears the answer, and ends.
    await startLesson(page, 'debug=1&calib=0&lesson=l3-e-kaabo', 'point', 'M');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await waitForPhase(page, 'YOUR_TURN', 20_000);
      expect((await lesson(page)).attempt).toBe(attempt);
      await strike(page);
      await expect
        .poll(async () => (await lesson(page)).lastResult, { timeout: 10_000 })
        .toBe('incomplete');
      await expect
        .poll(async () => (await lesson(page)).phase, { timeout: 10_000 })
        .not.toBe('YOUR_TURN');
    }
    await waitForPhase(page, 'END', 30_000);
    const end = await lesson(page);
    expect(end.stars['l3-e-kaabo']).toBe(0);
    expect(end.history.slice(-3)).toEqual(['DEMO', 'LEVEL_COMPLETE', 'END']);
    await page.waitForTimeout(300);
    await panelPng(page, 'p2c-end-panel.png');

    await page.waitForTimeout(APP_CONFIG.lesson.feedbackMs);
    await strike(page); // "Strike the drum to play again"
    await expect.poll(async () => (await lesson(page)).restarts).toBe(1);
    const restarted = await lesson(page);
    expect(restarted.level).toBe(1);
    expect(restarted.totalStars).toBe(0);
    expect(restarted.stars).toEqual({});
    expect(['LEVEL_INTRO', 'DEMO']).toContain(restarted.phase);
    expect(restarted.history.slice(-2)[0]).toBe('END');
    expect(await page.evaluate(() => window.__talkingDrumPitch!.calibration)).toBe('skipped');

    // The new session plays: one strike counts once (no duplicated listeners).
    await waitForPhase(page, 'YOUR_TURN', 15_000);
    expect((await lesson(page)).phraseId).toBe('l1-m');
    await strike(page);
    await expect.poll(async () => (await lesson(page)).feedback).toBe('correct');
    expect((await lesson(page)).strikes).toBe('M');
    expect((await lesson(page)).stars).toEqual({ 'l1-m': 3 });
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('an XR session ending mid-lesson returns to the title; re-entering plays on cleanly', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = trackErrors(page);
    await startLesson(page, 'debug=1&calib=0&lesson=l1-m', 'point', 'M');

    await page.getByTestId('enter-vr-button').click(); // Exit VR mid-lesson
    await expect(page.getByTestId('enter-vr-button')).toHaveText('Enter VR');
    await waitForPhase(page, 'TITLE');
    const reset = await lesson(page);
    expect(reset.xrResets).toBe(1);
    expect(reset.phraseId).toBe('l1-m');
    expect(reset.strikes).toBe('');

    await page.getByTestId('enter-vr-button').click(); // re-enter
    await expect(page.getByTestId('enter-vr-button')).toHaveText('Exit VR');
    await expect
      .poll(async () => (await pitchState(page)).tracking, { timeout: 5000 })
      .toBe('TRACKED');
    await setLeftPose(page, 'point');
    await expect.poll(async () => (await pitchState(page)).band, { timeout: 3000 }).toBe('M');
    await strike(page);
    await waitForPhase(page, 'YOUR_TURN');
    await strike(page);
    await expect.poll(async () => (await lesson(page)).feedback).toBe('correct');
    const after = await lesson(page);
    expect(after.strikes).toBe('M');
    expect(after.stars).toEqual({ 'l1-m': 3 });
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
