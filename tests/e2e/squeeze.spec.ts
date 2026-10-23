import { expect, test } from '@playwright/test';
import {
  enterVrWithIwerHands,
  pitchState,
  rightHandStrike,
  setLeftPose,
  trackErrors,
} from './iwer-hands.js';

/**
 * P2a squeeze / pitch e2e with injected IWER hands (see iwer-hands.ts for the pose limits).
 */

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
