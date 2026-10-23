import { APP_CONFIG, type LessonConfig, type PitchBand } from '../app/config.js';
import type { LessonEntry, LessonLevel } from '../content/lesson-types.js';

/**
 * "Listen, then echo" lesson flow as a pure reducer. The drum strike is the only control.
 *
 * TITLE -(strike)-> CALIBRATION -(calibration finished)-> LEVEL_INTRO -> DEMO -> YOUR_TURN
 * -> EVALUATE -> FEEDBACK -> (next phrase: DEMO | retry: DEMO | after the last try: answer DEMO,
 * then next phrase) -> LEVEL_COMPLETE -> LEVEL_INTRO (next level) | END -(strike)-> LEVEL_INTRO
 * (a fresh session; the squeeze calibration is kept). INTERRUPT (tab or headset hidden, then shown
 * again) restarts a demo that was cut off and the "your turn" wait.
 *
 * `reduceLesson` returns the SAME state object when nothing changes (no allocation on idle ticks)
 * and a new object on every transition. Side effects (play a demo) are listed in `effects` of the
 * new state for the host system to execute once.
 */

export type LessonPhase =
  | 'TITLE'
  | 'CALIBRATION'
  | 'LEVEL_INTRO'
  | 'DEMO'
  | 'YOUR_TURN'
  | 'EVALUATE'
  | 'FEEDBACK'
  | 'LEVEL_COMPLETE'
  | 'END';

export type FeedbackKind = 'correct' | 'retry' | 'answer';
export type DemoReason = 'first' | 'retry' | 'idle' | 'answer';

export interface LessonStrike {
  readonly band: PitchBand;
  readonly timeMs: number;
}

export interface AttemptResult {
  /** All syllables struck, each in the target band, in order. */
  readonly correct: boolean;
  /** As many strikes as syllables arrived before the attempt ended. */
  readonly complete: boolean;
  /** Per target syllable: struck in the right band (false if missing). */
  readonly perSyllable: readonly boolean[];
  readonly played: readonly PitchBand[];
}

export type FeedbackCue = 'correct' | 'retry';

export type LessonEffect =
  | {
      readonly type: 'PLAY_DEMO';
      readonly tones: readonly PitchBand[];
      readonly leadInMs: number;
      readonly intervalMs: number;
      readonly reason: DemoReason;
    }
  | { readonly type: 'PLAY_CUE'; readonly cue: FeedbackCue };

export interface PlannedLevel {
  readonly level: LessonLevel;
  readonly phrases: readonly LessonEntry[];
}

export interface SessionPlan {
  readonly levels: readonly PlannedLevel[];
}

export interface LessonState {
  readonly phase: LessonPhase;
  readonly enteredAtMs: number;
  readonly levelIndex: number;
  readonly phraseIndex: number;
  /** 1-based try number for the current phrase. */
  readonly attempt: number;
  readonly strikes: readonly LessonStrike[];
  readonly lastStrikeMs: number;
  readonly cueAtMs: number;
  readonly demoReason: DemoReason | null;
  readonly demoStartMs: number;
  readonly demoEndsAtMs: number;
  readonly lastResult: AttemptResult | null;
  readonly feedback: FeedbackKind | null;
  /** Stars per phrase id (0..3), filled as phrases finish. */
  readonly stars: Readonly<Record<string, number>>;
  readonly effects: readonly LessonEffect[];
  /** Increments on every transition. */
  readonly version: number;
  /** When the session started (the title strike, or the restart strike); NaN before that. */
  readonly sessionStartMs: number;
  /** True once the soft session cap ended the session early (END reached because of it). */
  readonly capped: boolean;
}

export type LessonEvent =
  | { readonly type: 'STRIKE'; readonly band: PitchBand; readonly timeMs: number }
  | { readonly type: 'TICK'; readonly timeMs: number }
  | { readonly type: 'CALIBRATION_READY'; readonly timeMs: number }
  | { readonly type: 'INTERRUPT'; readonly timeMs: number };

export const LEVEL_TITLES: Record<LessonLevel, string> = {
  1: 'Single tones',
  2: 'Tone words',
  3: 'Greetings',
};

const NO_EFFECTS: readonly LessonEffect[] = [];
const CORRECT_CUE: readonly LessonEffect[] = [{ type: 'PLAY_CUE', cue: 'correct' }];
const RETRY_CUE: readonly LessonEffect[] = [{ type: 'PLAY_CUE', cue: 'retry' }];
const NO_STRIKES: readonly LessonStrike[] = [];

/** Phrases per level in data-file order (config counts). `startId` jumps to that phrase. */
export function buildSessionPlan(
  entries: readonly LessonEntry[],
  config: LessonConfig = APP_CONFIG.lesson,
  startId?: string,
): { plan: SessionPlan; levelIndex: number; phraseIndex: number } {
  const levels: PlannedLevel[] = [];
  for (const level of [1, 2, 3] as const) {
    const phrases = entries
      .filter((e) => e.level === level)
      .slice(
        0,
        config.phrasesPerLevel[level] === 'all' ? undefined : config.phrasesPerLevel[level],
      );
    if (phrases.length > 0) {
      levels.push({ level, phrases });
    }
  }
  let levelIndex = 0;
  let phraseIndex = 0;
  const start = startId === undefined ? undefined : entries.find((e) => e.id === startId);
  if (start !== undefined) {
    levelIndex = levels.findIndex((l) => l.level === start.level);
    const found = levels[levelIndex].phrases.findIndex((p) => p.id === start.id);
    if (found >= 0) {
      phraseIndex = found;
    } else {
      levels[levelIndex] = {
        level: start.level,
        phrases: [start, ...levels[levelIndex].phrases.slice(0, -1)],
      };
    }
  }
  return { plan: { levels }, levelIndex, phraseIndex };
}

export function evaluateAttempt(
  target: readonly PitchBand[],
  strikes: readonly LessonStrike[],
): AttemptResult {
  const perSyllable = target.map((tone, i) => strikes[i]?.band === tone);
  const complete = strikes.length >= target.length;
  return {
    correct: complete && perSyllable.every(Boolean),
    complete,
    perSyllable,
    played: strikes.map((s) => s.band),
  };
}

/** 3 stars on the first try, 2 on the second, 1 on the third; never below 1 for a correct echo. */
export function starsForCorrectTry(attempt: number, maxTries: number): number {
  return Math.max(1, Math.min(3, maxTries + 1 - attempt));
}

export function createLessonState(levelIndex = 0, phraseIndex = 0, nowMs = 0): LessonState {
  return {
    phase: 'TITLE',
    enteredAtMs: nowMs,
    levelIndex,
    phraseIndex,
    attempt: 1,
    strikes: NO_STRIKES,
    lastStrikeMs: -Infinity,
    cueAtMs: 0,
    demoReason: null,
    demoStartMs: 0,
    demoEndsAtMs: 0,
    lastResult: null,
    feedback: null,
    stars: {},
    effects: NO_EFFECTS,
    version: 0,
    sessionStartMs: Number.NaN,
    capped: false,
  };
}

export function currentPhrase(state: LessonState, plan: SessionPlan): LessonEntry | null {
  return plan.levels[state.levelIndex]?.phrases[state.phraseIndex] ?? null;
}

export function totalStars(state: LessonState): number {
  let sum = 0;
  for (const id in state.stars) {
    sum += state.stars[id];
  }
  return sum;
}

export function maxStars(plan: SessionPlan): number {
  return plan.levels.reduce((n, l) => n + l.phrases.length * 3, 0);
}

function next(state: LessonState, patch: Partial<LessonState>): LessonState {
  return { ...state, effects: NO_EFFECTS, ...patch, version: state.version + 1 };
}

function startDemo(
  state: LessonState,
  plan: SessionPlan,
  config: LessonConfig,
  timeMs: number,
  reason: DemoReason,
  patch: Partial<LessonState> = {},
): LessonState {
  const base = { ...state, ...patch };
  const phrase = currentPhrase(base, plan);
  const tones = phrase?.tones ?? [];
  return next(base, {
    phase: 'DEMO',
    enteredAtMs: timeMs,
    demoReason: reason,
    demoStartMs: timeMs + config.demoLeadInMs,
    demoEndsAtMs: timeMs + config.demoLeadInMs + tones.length * config.syllableIntervalMs,
    strikes: NO_STRIKES,
    lastStrikeMs: -Infinity,
    effects: [
      {
        type: 'PLAY_DEMO',
        tones,
        leadInMs: config.demoLeadInMs,
        intervalMs: config.syllableIntervalMs,
        reason,
      },
    ],
  });
}

/**
 * Soft session cap: true once `sessionCapMs` has passed since the title strike. It is checked only
 * at phrase boundaries (after a phrase ends, after a level result, before a level's first phrase),
 * so a phrase in progress, including its retries and the answer, always finishes normally first.
 */
export function capReached(state: LessonState, config: LessonConfig, timeMs: number): boolean {
  return (
    Number.isFinite(config.sessionCapMs) &&
    Number.isFinite(state.sessionStartMs) &&
    timeMs - state.sessionStartMs >= config.sessionCapMs
  );
}

function advancePhrase(
  state: LessonState,
  plan: SessionPlan,
  config: LessonConfig,
  timeMs: number,
  stars: Readonly<Record<string, number>>,
): LessonState {
  if (capReached(state, config, timeMs)) {
    return next(state, { phase: 'END', enteredAtMs: timeMs, stars, feedback: null, capped: true });
  }
  const level = plan.levels[state.levelIndex];
  const nextIndex = state.phraseIndex + 1;
  if (level !== undefined && nextIndex < level.phrases.length) {
    return startDemo(state, plan, config, timeMs, 'first', {
      phraseIndex: nextIndex,
      attempt: 1,
      lastResult: null,
      feedback: null,
      stars,
    });
  }
  return next(state, { phase: 'LEVEL_COMPLETE', enteredAtMs: timeMs, stars, feedback: null });
}

export function reduceLesson(
  state: LessonState,
  event: LessonEvent,
  plan: SessionPlan,
  config: LessonConfig = APP_CONFIG.lesson,
): LessonState {
  const t = event.timeMs;
  const phrase = currentPhrase(state, plan);

  if (event.type === 'INTERRUPT') {
    if (state.phase === 'DEMO') {
      return startDemo(state, plan, config, t, state.demoReason ?? 'first');
    }
    if (state.phase === 'YOUR_TURN') {
      return next(state, { cueAtMs: t, strikes: NO_STRIKES, lastStrikeMs: -Infinity });
    }
    return state;
  }

  switch (state.phase) {
    case 'TITLE':
      return event.type === 'STRIKE'
        ? next(state, { phase: 'CALIBRATION', enteredAtMs: t, sessionStartMs: t })
        : state;

    case 'CALIBRATION':
      return event.type === 'CALIBRATION_READY'
        ? next(state, { phase: 'LEVEL_INTRO', enteredAtMs: t })
        : state;

    case 'LEVEL_INTRO':
      if (event.type !== 'TICK' || t - state.enteredAtMs < config.levelIntroMs) {
        return state;
      }
      if (capReached(state, config, t)) {
        return next(state, { phase: 'END', enteredAtMs: t, capped: true });
      }
      return startDemo(state, plan, config, t, 'first', {
        attempt: 1,
        lastResult: null,
        feedback: null,
      });

    case 'DEMO':
      if (event.type !== 'TICK' || t < state.demoEndsAtMs + config.postDemoPauseMs) {
        return state;
      }
      if (state.demoReason === 'answer') {
        const stars = { ...state.stars, [phrase?.id ?? '']: 0 };
        return advancePhrase(state, plan, config, t, stars);
      }
      return next(state, {
        phase: 'YOUR_TURN',
        enteredAtMs: t,
        cueAtMs: t,
        strikes: NO_STRIKES,
        lastStrikeMs: -Infinity,
      });

    case 'YOUR_TURN': {
      const target = phrase?.tones ?? [];
      if (event.type === 'STRIKE') {
        const strikes = [...state.strikes, { band: event.band, timeMs: t }];
        if (strikes.length >= target.length) {
          return next(state, {
            phase: 'EVALUATE',
            enteredAtMs: t,
            strikes,
            lastStrikeMs: t,
            lastResult: evaluateAttempt(target, strikes),
          });
        }
        return next(state, { strikes, lastStrikeMs: t });
      }
      if (event.type !== 'TICK') {
        return state;
      }
      if (state.strikes.length > 0 && t - state.lastStrikeMs >= config.attemptGapMs) {
        return next(state, {
          phase: 'EVALUATE',
          enteredAtMs: t,
          lastResult: evaluateAttempt(target, state.strikes),
        });
      }
      if (state.strikes.length === 0 && t - state.cueAtMs >= config.idleReplayMs) {
        return startDemo(state, plan, config, t, 'idle');
      }
      return state;
    }

    case 'EVALUATE': {
      if (event.type !== 'TICK') {
        return state;
      }
      if (state.lastResult?.correct === true) {
        return next(state, {
          phase: 'FEEDBACK',
          enteredAtMs: t,
          feedback: 'correct',
          effects: CORRECT_CUE,
          stars: {
            ...state.stars,
            [phrase?.id ?? '']: starsForCorrectTry(state.attempt, config.maxTries),
          },
        });
      }
      return next(state, {
        phase: 'FEEDBACK',
        enteredAtMs: t,
        feedback: state.attempt >= config.maxTries ? 'answer' : 'retry',
        effects: RETRY_CUE,
      });
    }

    case 'FEEDBACK':
      if (event.type !== 'TICK' || t - state.enteredAtMs < config.feedbackMs) {
        return state;
      }
      if (state.feedback === 'correct') {
        return advancePhrase(state, plan, config, t, state.stars);
      }
      if (state.feedback === 'retry') {
        return startDemo(state, plan, config, t, 'retry', { attempt: state.attempt + 1 });
      }
      return startDemo(state, plan, config, t, 'answer');

    case 'LEVEL_COMPLETE':
      if (event.type !== 'TICK' || t - state.enteredAtMs < config.levelCompleteMs) {
        return state;
      }
      if (capReached(state, config, t)) {
        return next(state, { phase: 'END', enteredAtMs: t, capped: true });
      }
      if (state.levelIndex + 1 < plan.levels.length) {
        return next(state, {
          phase: 'LEVEL_INTRO',
          enteredAtMs: t,
          levelIndex: state.levelIndex + 1,
          phraseIndex: 0,
          attempt: 1,
          lastResult: null,
        });
      }
      return next(state, { phase: 'END', enteredAtMs: t });

    case 'END':
      // "Strike the drum to play again": a fresh session from the first level, straight to the
      // level intro (calibration is kept). A short guard stops the last echo from restarting it.
      return event.type === 'STRIKE' && t - state.enteredAtMs >= config.feedbackMs
        ? {
            ...createLessonState(0, 0, t),
            phase: 'LEVEL_INTRO',
            sessionStartMs: t,
            version: state.version + 1,
          }
        : state;
  }
}

/** Stars earned in one level (for LEVEL_COMPLETE). */
export function levelStars(state: LessonState, plan: SessionPlan, levelIndex: number): number {
  let sum = 0;
  for (const p of plan.levels[levelIndex]?.phrases ?? []) {
    sum += state.stars[p.id] ?? 0;
  }
  return sum;
}
