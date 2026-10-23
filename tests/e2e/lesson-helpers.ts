import { expect, type Page } from '@playwright/test';
import { enterVrWithIwerHands, pitchState, rightHandStrike, setLeftPose } from './iwer-hands.js';

/** Shared lesson helpers (window.__talkingDrumLesson) for the lesson e2e specs. */

export interface LessonDiag {
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
  ignoredStrikes: number;
  interruptions: number;
  restarts: number;
  xrResets: number;
  cuesPlayed: number;
  totalStars: number;
  level: number;
}

export async function lesson(page: Page): Promise<LessonDiag> {
  return page.evaluate(() => {
    const d = (window as unknown as { __talkingDrumLesson: LessonDiag }).__talkingDrumLesson;
    return { ...d, stars: { ...d.stars }, history: [...d.history] };
  });
}

export async function waitForPhase(page: Page, phase: string, timeout = 15_000): Promise<void> {
  await expect.poll(async () => (await lesson(page)).phase, { timeout }).toBe(phase);
}

export async function strike(page: Page): Promise<void> {
  expect(await rightHandStrike(page), 'scripted right-hand strike registered').toBe(true);
}

export async function startLesson(
  page: Page,
  query: string,
  pose: 'default' | 'point',
  band: string,
) {
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
