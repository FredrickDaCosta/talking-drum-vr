import { APP_CONFIG, type LessonConfig } from '../app/config.js';
import type { SessionPlan } from './lesson-machine.js';

/** Player-pace assumptions for the session-length estimate (all UNVERIFIED until playtests). */
export interface PacingAssumptions {
  /** Reading the title, the strike to begin, and the squeeze calibration (milliseconds). */
  readonly startMs: number;
  /** From "Your turn" to the first strike (milliseconds). */
  readonly firstStrikeMs: number;
  /** Between the player's strikes within one echo (milliseconds). */
  readonly betweenStrikesMs: number;
  /** Average tries per phrase, by level (1 = always right first time; at most maxTries). */
  readonly averageTries: Readonly<Record<1 | 2 | 3, number>>;
  /** Share of phrases that end in the answer replay after the last try, by level. */
  readonly answerShare: Readonly<Record<1 | 2 | 3, number>>;
}

export const NORMAL_PACE: PacingAssumptions = {
  startMs: 15_000,
  firstStrikeMs: 1500,
  betweenStrikesMs: 700,
  averageTries: { 1: 1.4, 2: 1.7, 3: 1.9 },
  answerShare: { 1: 0.05, 2: 0.1, 3: 0.15 },
};

export const FIRST_TRY_PACE: PacingAssumptions = {
  ...NORMAL_PACE,
  averageTries: { 1: 1, 2: 1, 3: 1 },
  answerShare: { 1: 0, 2: 0, 3: 0 },
};

/** Demo, pause, echo and feedback for one try at an n-syllable phrase (milliseconds). */
export function tryMs(syllables: number, config: LessonConfig, pace: PacingAssumptions): number {
  const demo = config.demoLeadInMs + syllables * config.syllableIntervalMs + config.postDemoPauseMs;
  const echo = pace.firstStrikeMs + (syllables - 1) * pace.betweenStrikesMs;
  return demo + echo + config.feedbackMs;
}

export interface SessionEstimate {
  readonly totalMs: number;
  readonly perLevelMs: readonly number[];
}

/** Expected session length for a plan at a given pace (a model, not a measurement). */
export function estimateSessionMs(
  plan: SessionPlan,
  config: LessonConfig = APP_CONFIG.lesson,
  pace: PacingAssumptions = NORMAL_PACE,
): SessionEstimate {
  const perLevelMs = plan.levels.map((level) => {
    let ms = config.levelIntroMs + config.levelCompleteMs;
    for (const phrase of level.phrases) {
      const n = phrase.tones.length;
      const tries = Math.min(config.maxTries, pace.averageTries[level.level]);
      const answer = config.demoLeadInMs + n * config.syllableIntervalMs + config.postDemoPauseMs;
      ms += tries * tryMs(n, config, pace) + pace.answerShare[level.level] * answer;
    }
    return ms;
  });
  return { totalMs: pace.startMs + perLevelMs.reduce((a, b) => a + b, 0), perLevelMs };
}
