import { describe, expect, it } from 'vitest';
import { APP_CONFIG, type LessonConfig, type PitchBand } from '../../src/app/config.js';
import type { LessonEntry } from '../../src/content/lesson-types.js';
import { LESSONS } from '../../src/content/lessons.js';
import { validateLessons } from '../../src/content/validate-lessons.js';
import {
  buildSessionPlan,
  createLessonState,
  evaluateAttempt,
  type LessonEvent,
  type LessonState,
  levelStars,
  maxStars,
  reduceLesson,
  type SessionPlan,
  starsForCorrectTry,
  totalStars,
} from '../../src/game/lesson-machine.js';
import { lessonPanelReachFromDefaultEye } from '../../src/game/lesson-panel-layout.js';
import { buildLessonView } from '../../src/game/lesson-view.js';

const cfg: LessonConfig = APP_CONFIG.lesson;

function entry(
  id: string,
  level: 1 | 2 | 3,
  tones: PitchBand[],
  extra: Partial<LessonEntry> = {},
): LessonEntry {
  return {
    id,
    level,
    text: level === 1 ? '' : tones.map((_, i) => `ba${i}`).join(''),
    gloss: `gloss ${id}`,
    syllables: tones.map((_, i) => (level === 1 ? String(i + 1) : `ba${i}`)),
    tones,
    reviewStatus: 'draft',
    ...extra,
  };
}

// Two levels: level 1 has two phrases, level 2 has one two-syllable phrase.
const FIXTURE: LessonEntry[] = [
  entry('a', 1, ['M']),
  entry('b', 1, ['H', 'L']),
  entry('c', 2, ['L', 'H']),
];
const fixtureConfig: LessonConfig = { ...cfg, phrasesPerLevel: { 1: 2, 2: 1, 3: 4 } };
const plan: SessionPlan = buildSessionPlan(FIXTURE, fixtureConfig).plan;

const tick = (timeMs: number): LessonEvent => ({ type: 'TICK', timeMs });
const strike = (band: PitchBand, timeMs: number): LessonEvent => ({
  type: 'STRIKE',
  band,
  timeMs,
});

function reduce(state: LessonState, event: LessonEvent): LessonState {
  return reduceLesson(state, event, plan, fixtureConfig);
}

/** TITLE -> CALIBRATION -> LEVEL_INTRO -> DEMO -> YOUR_TURN for the first phrase, at t = 0. */
function toFirstTurn(): { state: LessonState; t: number } {
  let s = createLessonState(0, 0, 0);
  s = reduce(s, strike('M', 0));
  s = reduce(s, { type: 'CALIBRATION_READY', timeMs: 10 });
  s = reduce(s, tick(10 + cfg.levelIntroMs));
  expect(s.phase).toBe('DEMO');
  const t = s.demoEndsAtMs + cfg.postDemoPauseMs;
  s = reduce(s, tick(t));
  expect(s.phase).toBe('YOUR_TURN');
  return { state: s, t };
}

/** Plays a whole attempt from YOUR_TURN and returns the FEEDBACK state. */
function attempt(state: LessonState, bands: PitchBand[], t: number): LessonState {
  let s = state;
  bands.forEach((b, i) => {
    s = reduce(s, strike(b, t + 100 * (i + 1)));
  });
  expect(s.phase).toBe('EVALUATE');
  s = reduce(s, tick(t + 1000));
  expect(s.phase).toBe('FEEDBACK');
  return s;
}

/** FEEDBACK -> DEMO -> YOUR_TURN (a retry), returning the state and the cue time. */
function nextTurn(state: LessonState): { state: LessonState; t: number } {
  let s = reduce(state, tick(state.enteredAtMs + cfg.feedbackMs));
  expect(s.phase).toBe('DEMO');
  const t = s.demoEndsAtMs + cfg.postDemoPauseMs;
  s = reduce(s, tick(t));
  expect(s.phase).toBe('YOUR_TURN');
  return { state: s, t };
}

describe('lesson content (src/content/lessons.ts)', () => {
  it('passes validation with the configured per-level minimums', () => {
    const report = validateLessons(LESSONS, cfg.minEntriesPerLevel);
    expect(report.errors).toEqual([]);
    expect(report.countsByLevel[1]).toBeGreaterThanOrEqual(cfg.minEntriesPerLevel[1]);
    expect(report.countsByLevel[2]).toBeGreaterThanOrEqual(cfg.minEntriesPerLevel[2]);
    expect(report.countsByLevel[3]).toBeGreaterThanOrEqual(cfg.minEntriesPerLevel[3]);
  });

  it('keeps every level-2/3 entry draft until reviewed; level-1 tone drills have no words', () => {
    for (const e of LESSONS) {
      if (e.level === 1) {
        expect(e.text).toBe('');
      } else {
        expect(e.reviewStatus).toBe('draft');
      }
    }
  });

  it('stores Yoruba with diacritics in NFC (e.g. ọ̀ = U+1ECD U+0300)', () => {
    const kaabo = LESSONS.find((e) => e.id === 'l3-e-kaabo');
    expect(kaabo?.text).toBe('Ẹ káàbọ̀');
    for (const e of LESSONS) {
      expect(e.text).toBe(e.text.normalize('NFC'));
    }
  });
});

describe('validateLessons', () => {
  const min = { 1: 1, 2: 1, 3: 0 } as const;
  const good = [entry('x', 1, ['M']), entry('y', 2, ['L', 'H'])];

  it('accepts good entries and counts drafts without failing', () => {
    const report = validateLessons(good, min);
    expect(report.errors).toEqual([]);
    expect(report.draftIds).toEqual(['x', 'y']);
    expect(report.countsByLevel).toEqual({ 1: 1, 2: 1, 3: 0 });
  });

  it.each([
    ['duplicate ids', [...good, entry('x', 1, ['H'])], /duplicated/],
    ['tones vs syllables', [entry('z', 2, ['L', 'H'], { tones: ['L'] })], /1 tones for 2/],
    ['bad tone', [entry('z', 1, ['M'], { tones: ['X' as PitchBand] })], /only L, M or H/],
    ['non-NFC text', [entry('z', 2, ['M'], { text: 'ọ', syllables: ['ọ'] })], /NFC/],
    ['spelling', [entry('z', 2, ['M', 'M'], { text: 'abc' })], /syllables spell/],
    ['level-1 word', [entry('z', 1, ['M'], { text: 'ba' })], /level-1 drills/],
    ['status', [entry('z', 1, ['M'], { reviewStatus: 'ok' as 'draft' })], /reviewStatus/],
    ['empty gloss', [entry('z', 1, ['M'], { gloss: ' ' })], /gloss is empty/],
  ])('rejects %s', (_name, entries, pattern) => {
    const report = validateLessons(entries, { 1: 0, 2: 0, 3: 0 });
    expect(report.errors.join('\n')).toMatch(pattern);
  });

  it('enforces the minimum entries per level', () => {
    const report = validateLessons(good, { 1: 2, 2: 1, 3: 1 });
    expect(report.errors).toEqual([
      'level 1: 1 entries, at least 2 required',
      'level 3: 0 entries, at least 1 required',
    ]);
  });
});

describe('evaluateAttempt and stars', () => {
  it('scores band and order only', () => {
    const s = (bands: PitchBand[]) => bands.map((band, i) => ({ band, timeMs: i * 5000 }));
    expect(evaluateAttempt(['L', 'H'], s(['L', 'H']))).toEqual({
      correct: true,
      complete: true,
      perSyllable: [true, true],
      played: ['L', 'H'],
    });
    expect(evaluateAttempt(['L', 'H'], s(['H', 'L'])).correct).toBe(false);
    expect(evaluateAttempt(['L', 'H'], s(['L', 'M'])).perSyllable).toEqual([true, false]);
    const incomplete = evaluateAttempt(['L', 'H', 'M'], s(['L', 'H']));
    expect(incomplete).toMatchObject({ correct: false, complete: false });
    expect(incomplete.perSyllable).toEqual([true, true, false]);
  });

  it('gives 3/2/1 stars for a correct 1st/2nd/3rd try', () => {
    expect([1, 2, 3].map((a) => starsForCorrectTry(a, 3))).toEqual([3, 2, 1]);
  });
});

describe('buildSessionPlan', () => {
  it('takes the configured number of phrases per level in file order', () => {
    const { plan: full, levelIndex, phraseIndex } = buildSessionPlan(LESSONS, cfg);
    expect(full.levels.map((l) => [l.level, l.phrases.length])).toEqual([
      [1, cfg.phrasesPerLevel[1]],
      [2, cfg.phrasesPerLevel[2]],
      [3, cfg.phrasesPerLevel[3]],
    ]);
    expect([levelIndex, phraseIndex]).toEqual([0, 0]);
    expect(maxStars(full)).toBe(3 * (5 + 6 + 4));
  });

  it('jumps to ?lesson=<id>, inserting a phrase that is outside the played slice', () => {
    expect(buildSessionPlan(LESSONS, cfg, 'l1-l')).toMatchObject({ levelIndex: 0, phraseIndex: 2 });
    const late = buildSessionPlan(LESSONS, cfg, 'l2-baba-lh');
    expect(late.levelIndex).toBe(1);
    expect(late.phraseIndex).toBe(0);
    expect(late.plan.levels[1].phrases[0].id).toBe('l2-baba-lh');
    expect(late.plan.levels[1].phrases).toHaveLength(cfg.phrasesPerLevel[2]);
    expect(buildSessionPlan(LESSONS, cfg, 'nope')).toMatchObject({ levelIndex: 0, phraseIndex: 0 });
  });
});

describe('reduceLesson', () => {
  it('TITLE waits for a strike; CALIBRATION waits for calibration to finish', () => {
    const title = createLessonState(0, 0, 0);
    expect(reduce(title, tick(99_999))).toBe(title);
    expect(reduce(title, { type: 'CALIBRATION_READY', timeMs: 1 })).toBe(title);
    const calib = reduce(title, strike('L', 5));
    expect(calib.phase).toBe('CALIBRATION');
    expect(calib.version).toBe(1);
    expect(reduce(calib, strike('L', 6))).toBe(calib);
    expect(reduce(calib, tick(99_999))).toBe(calib);
    expect(reduce(calib, { type: 'CALIBRATION_READY', timeMs: 7 }).phase).toBe('LEVEL_INTRO');
  });

  it('LEVEL_INTRO shows for levelIntroMs, then the demo is scheduled as an effect', () => {
    let s = reduce(reduce(createLessonState(), strike('M', 0)), {
      type: 'CALIBRATION_READY',
      timeMs: 0,
    });
    expect(reduce(s, tick(cfg.levelIntroMs - 1))).toBe(s);
    s = reduce(s, tick(cfg.levelIntroMs));
    expect(s.phase).toBe('DEMO');
    expect(s.demoReason).toBe('first');
    expect(s.effects).toEqual([
      {
        type: 'PLAY_DEMO',
        tones: ['M'],
        leadInMs: cfg.demoLeadInMs,
        intervalMs: cfg.syllableIntervalMs,
        reason: 'first',
      },
    ]);
    expect(s.demoStartMs).toBe(cfg.levelIntroMs + cfg.demoLeadInMs);
    expect(s.demoEndsAtMs).toBe(s.demoStartMs + cfg.syllableIntervalMs);
  });

  it('DEMO ignores strikes and hands over after the demo plus the pause', () => {
    let s = createLessonState();
    s = reduce(s, strike('M', 0));
    s = reduce(s, { type: 'CALIBRATION_READY', timeMs: 0 });
    s = reduce(s, tick(cfg.levelIntroMs));
    expect(reduce(s, strike('M', s.demoStartMs))).toBe(s);
    const due = s.demoEndsAtMs + cfg.postDemoPauseMs;
    expect(reduce(s, tick(due - 1))).toBe(s);
    const turn = reduce(s, tick(due));
    expect(turn.phase).toBe('YOUR_TURN');
    expect(turn.cueAtMs).toBe(due);
    expect(turn.effects).toEqual([]);
  });

  it('a correct first echo earns 3 stars and advances to the next phrase', () => {
    const { state, t } = toFirstTurn();
    const fb = attempt(state, ['M'], t);
    expect(fb.feedback).toBe('correct');
    expect(fb.lastResult?.correct).toBe(true);
    expect(fb.stars).toEqual({ a: 3 });
    expect(reduce(fb, tick(fb.enteredAtMs + cfg.feedbackMs - 1))).toBe(fb);
    const next = reduce(fb, tick(fb.enteredAtMs + cfg.feedbackMs));
    expect(next.phase).toBe('DEMO');
    expect(next.phraseIndex).toBe(1);
    expect(next.attempt).toBe(1);
    expect(next.effects[0]).toMatchObject({ tones: ['H', 'L'], reason: 'first' });
  });

  it('records strikes one by one and evaluates at n strikes', () => {
    let { state: s, t } = toFirstTurn();
    s = reduce(attempt(s, ['M'], t), tick(1e6)); // phrase b: H L
    s = reduce(s, tick(s.demoEndsAtMs + cfg.postDemoPauseMs));
    t = s.cueAtMs;
    s = reduce(s, strike('H', t + 50));
    expect(s.phase).toBe('YOUR_TURN');
    expect(s.strikes).toEqual([{ band: 'H', timeMs: t + 50 }]);
    s = reduce(s, strike('L', t + 900));
    expect(s.phase).toBe('EVALUATE');
    expect(s.lastResult?.correct).toBe(true);
  });

  it('ends an incomplete attempt after attemptGapMs (counted as wrong, retry)', () => {
    let { state: s, t } = toFirstTurn();
    s = reduce(attempt(s, ['M'], t), tick(1e6));
    s = reduce(s, tick(s.demoEndsAtMs + cfg.postDemoPauseMs));
    t = s.cueAtMs;
    s = reduce(s, strike('H', t + 100));
    expect(reduce(s, tick(t + 100 + cfg.attemptGapMs - 1))).toBe(s);
    s = reduce(s, tick(t + 100 + cfg.attemptGapMs));
    expect(s.phase).toBe('EVALUATE');
    expect(s.lastResult).toMatchObject({ correct: false, complete: false });
    s = reduce(s, tick(t + 100 + cfg.attemptGapMs + 1));
    expect(s.feedback).toBe('retry');
  });

  it('replays the demo after idleReplayMs with no strike, without costing a try', () => {
    const { state, t } = toFirstTurn();
    expect(reduce(state, tick(t + cfg.idleReplayMs - 1))).toBe(state);
    const replay = reduce(state, tick(t + cfg.idleReplayMs));
    expect(replay.phase).toBe('DEMO');
    expect(replay.demoReason).toBe('idle');
    expect(replay.attempt).toBe(1);
    expect(replay.effects[0]).toMatchObject({ reason: 'idle', tones: ['M'] });
  });

  it('a wrong echo retries; correct on the 2nd try = 2 stars, on the 3rd = 1 star', () => {
    let { state: s, t } = toFirstTurn();
    s = attempt(s, ['L'], t);
    expect(s.feedback).toBe('retry');
    expect(s.lastResult?.correct).toBe(false);
    ({ state: s, t } = nextTurn(s));
    expect(s.attempt).toBe(2);
    expect(s.demoReason).toBe('retry');
    const second = attempt(s, ['M'], t);
    expect(second.stars).toEqual({ a: 2 });

    s = attempt(s, ['H'], t);
    ({ state: s, t } = nextTurn(s));
    expect(s.attempt).toBe(3);
    expect(attempt(s, ['M'], t).stars).toEqual({ a: 1 });
  });

  it('after the third failure it plays the answer, scores 0 stars and advances', () => {
    let { state: s, t } = toFirstTurn();
    for (let i = 1; i <= 2; i += 1) {
      s = attempt(s, ['L'], t);
      ({ state: s, t } = nextTurn(s));
    }
    s = attempt(s, ['L'], t);
    expect(s.attempt).toBe(3);
    expect(s.feedback).toBe('answer');
    s = reduce(s, tick(s.enteredAtMs + cfg.feedbackMs));
    expect(s.phase).toBe('DEMO');
    expect(s.demoReason).toBe('answer');
    expect(s.effects[0]).toMatchObject({ reason: 'answer', tones: ['M'] });
    expect(reduce(s, strike('M', s.demoStartMs))).toBe(s); // no echo during the answer
    s = reduce(s, tick(s.demoEndsAtMs + cfg.postDemoPauseMs));
    expect(s.stars).toEqual({ a: 0 });
    expect(s.phase).toBe('DEMO');
    expect(s.phraseIndex).toBe(1);
    expect(s.attempt).toBe(1);
  });

  it('completes levels, then ends with a summary; a strike after END restarts', () => {
    const first = toFirstTurn();
    let s = attempt(first.state, ['M'], first.t); // a: 3
    s = reduce(s, tick(s.enteredAtMs + cfg.feedbackMs));
    s = reduce(s, tick(s.demoEndsAtMs + cfg.postDemoPauseMs));
    s = attempt(s, ['H', 'L'], s.cueAtMs); // b: 3
    s = reduce(s, tick(s.enteredAtMs + cfg.feedbackMs));
    expect(s.phase).toBe('LEVEL_COMPLETE');
    expect(levelStars(s, plan, 0)).toBe(6);
    expect(reduce(s, tick(s.enteredAtMs + cfg.levelCompleteMs - 1))).toBe(s);
    s = reduce(s, tick(s.enteredAtMs + cfg.levelCompleteMs));
    expect(s).toMatchObject({ phase: 'LEVEL_INTRO', levelIndex: 1, phraseIndex: 0, attempt: 1 });

    s = reduce(s, tick(s.enteredAtMs + cfg.levelIntroMs));
    s = reduce(s, tick(s.demoEndsAtMs + cfg.postDemoPauseMs));
    s = attempt(s, ['H', 'H'], s.cueAtMs); // c (L H): wrong
    ({ state: s } = nextTurn(s));
    s = attempt(s, ['L', 'H'], s.cueAtMs); // c: 2
    s = reduce(s, tick(s.enteredAtMs + cfg.feedbackMs));
    expect(s.phase).toBe('LEVEL_COMPLETE');
    s = reduce(s, tick(s.enteredAtMs + cfg.levelCompleteMs));
    expect(s.phase).toBe('END');
    expect(totalStars(s)).toBe(8);
    expect(maxStars(plan)).toBe(9);

    expect(reduce(s, strike('M', s.enteredAtMs + 10))).toBe(s); // guard
    const again = reduce(s, strike('M', s.enteredAtMs + cfg.feedbackMs));
    expect(again).toMatchObject({ phase: 'TITLE', levelIndex: 0, phraseIndex: 0, stars: {} });
    expect(again.version).toBe(s.version + 1);
  });

  it('returns the same object on idle ticks (no per-frame allocation)', () => {
    const { state } = toFirstTurn();
    expect(reduce(state, tick(state.cueAtMs + 1))).toBe(state);
  });
});

describe('buildLessonView', () => {
  const ctx = { calibrationPrompt: null, demoIndex: -1 };

  it('shows the title prompt, or the calibration prompt while it runs', () => {
    const title = createLessonState();
    expect(buildLessonView(title, plan, ctx).status).toBe('Strike the drum to begin');
    expect(
      buildLessonView(title, plan, { calibrationPrompt: 'Open hand', demoIndex: -1 }).status,
    ).toBe('Open hand');
  });

  it('shows the word, syllables, tones, highlight and state text', () => {
    const real = buildSessionPlan(LESSONS, cfg, 'l3-e-kaabo');
    let s = createLessonState(real.levelIndex, real.phraseIndex);
    s = reduceLesson(s, strike('M', 0), real.plan);
    s = reduceLesson(s, { type: 'CALIBRATION_READY', timeMs: 0 }, real.plan);
    s = reduceLesson(s, tick(cfg.levelIntroMs), real.plan);
    const demo = buildLessonView(s, real.plan, { calibrationPrompt: null, demoIndex: 2 });
    expect(demo).toMatchObject({
      word: 'Ẹ káàbọ̀',
      syllables: ['Ẹ', 'ká', 'à', 'bọ̀'],
      tones: ['M', 'H', 'L', 'L'],
      gloss: 'welcome',
      status: 'Listen',
      detail: 'Try 1 of 3',
      highlightIndex: 2,
    });
    s = reduceLesson(s, tick(s.demoEndsAtMs + cfg.postDemoPauseMs), real.plan);
    s = reduceLesson(s, strike('M', s.cueAtMs + 1), real.plan);
    const turn = buildLessonView(s, real.plan, ctx);
    expect(turn.status).toBe('Your turn');
    expect(turn.marks).toEqual(['none', 'missing', 'missing', 'missing']);
  });

  it('shows Well done with stars, Try again, and the answer', () => {
    const { state, t } = toFirstTurn();
    const right = buildLessonView(attempt(state, ['M'], t), plan, ctx);
    expect(right).toMatchObject({ status: 'Well done', stars: { earned: 3, max: 3 } });
    expect(right.marks).toEqual(['right']);
    const wrong = buildLessonView(attempt(state, ['L'], t), plan, ctx);
    expect(wrong).toMatchObject({ status: 'Try again', detail: 'Not quite on try 1 of 3' });
    expect(wrong.marks).toEqual(['wrong']);
  });

  it('shows the session summary with total stars at END', () => {
    const end: LessonState = { ...createLessonState(), phase: 'END', stars: { a: 3, b: 1 } };
    expect(buildLessonView(end, plan, ctx)).toMatchObject({
      status: 'Session complete',
      stars: { earned: 4, max: 9 },
    });
  });
});

describe('lesson panel placement', () => {
  it('keeps every panel corner within the 0.61 m reach of the default eye position', () => {
    const reach = lessonPanelReachFromDefaultEye();
    expect(reach).toBeLessThanOrEqual(0.61);
    expect(reach).toBeGreaterThan(0.4);
  });
});
