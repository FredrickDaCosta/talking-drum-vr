import { APP_CONFIG, type LessonConfig, type PitchBand } from '../app/config.js';
import {
  currentPhrase,
  LEVEL_TITLES,
  levelStars,
  type LessonState,
  maxStars,
  type SessionPlan,
  totalStars,
} from './lesson-machine.js';

/** Per-syllable mark after an attempt: struck in the right band, wrong band, or not struck. */
export type SyllableMark = 'right' | 'wrong' | 'missing' | 'none';

/** Everything the in-world lesson panel draws. Pure data, built only when something changes. */
export interface LessonView {
  /** Small header line (level, phrase count). */
  readonly header: string;
  /** Yoruba word or phrase (NFC); empty for level-1 tone drills. */
  readonly word: string;
  readonly syllables: readonly string[];
  readonly tones: readonly PitchBand[];
  readonly gloss: string;
  /** "Listen", "Your turn", "Try again", "Well done", ... */
  readonly status: string;
  /** Secondary line under the status (attempt, prompt, summary). */
  readonly detail: string;
  /** Syllable to highlight during a demo, or -1. */
  readonly highlightIndex: number;
  readonly marks: readonly SyllableMark[];
  /** Stars to draw (earned of max), or null for none. */
  readonly stars: { readonly earned: number; readonly max: number } | null;
}

export interface LessonViewContext {
  /** Live squeeze-calibration prompt (status channel), shown while calibration runs. */
  readonly calibrationPrompt: string | null;
  /** Current demo syllable (from the audio clock), or -1. */
  readonly demoIndex: number;
}

const NO_MARKS: readonly SyllableMark[] = [];

function marksFor(state: LessonState, count: number): readonly SyllableMark[] {
  if (state.phase === 'YOUR_TURN') {
    return Array.from({ length: count }, (_, i) => (i < state.strikes.length ? 'none' : 'missing'));
  }
  const result = state.lastResult;
  if (result === null || (state.phase !== 'EVALUATE' && state.phase !== 'FEEDBACK')) {
    return NO_MARKS;
  }
  return result.perSyllable.map((ok, i) =>
    ok ? 'right' : i < result.played.length ? 'wrong' : 'missing',
  );
}

export function buildLessonView(
  state: LessonState,
  plan: SessionPlan,
  context: LessonViewContext,
  config: LessonConfig = APP_CONFIG.lesson,
): LessonView {
  const level = plan.levels[state.levelIndex];
  const phrase = currentPhrase(state, plan);
  const levelLabel =
    level === undefined ? '' : `Level ${level.level}: ${LEVEL_TITLES[level.level]}`;
  const phraseHeader =
    level === undefined
      ? ''
      : `${levelLabel}  ·  ${state.phraseIndex + 1} of ${level.phrases.length}`;
  const empty = {
    word: '',
    syllables: [] as string[],
    tones: [] as PitchBand[],
    gloss: '',
    highlightIndex: -1,
    marks: NO_MARKS,
    stars: null,
  };

  switch (state.phase) {
    case 'TITLE':
      return {
        ...empty,
        header: 'Talking Drum',
        status: context.calibrationPrompt ?? 'Strike the drum to begin',
        detail: 'Listen to the drum, then echo it: right hand strikes, left hand squeezes.',
      };
    case 'CALIBRATION':
      return {
        ...empty,
        header: 'Talking Drum',
        status: context.calibrationPrompt ?? 'Getting your left hand ready',
        detail: 'Follow the prompt with your left hand.',
      };
    case 'LEVEL_INTRO':
      return {
        ...empty,
        header: levelLabel,
        status: levelLabel,
        detail: `${level?.phrases.length ?? 0} to echo. Listen first, then strike the same tones.`,
      };
    case 'LEVEL_COMPLETE':
      return {
        ...empty,
        header: levelLabel,
        status: `Level ${level?.level ?? ''} complete`,
        detail: 'Next level coming up.',
        stars: {
          earned: levelStars(state, plan, state.levelIndex),
          max: (level?.phrases.length ?? 0) * 3,
        },
      };
    case 'END':
      return {
        ...empty,
        header: 'Session complete',
        status: 'Session complete',
        detail: 'Strike the drum to play again.',
        stars: { earned: totalStars(state), max: maxStars(plan) },
      };
    default:
      break;
  }

  const tones = phrase?.tones ?? [];
  const base = {
    header: phraseHeader,
    word: phrase?.text ?? '',
    syllables: phrase?.syllables ?? [],
    tones,
    gloss: phrase?.gloss ?? '',
    highlightIndex: -1,
    marks: marksFor(state, tones.length),
    stars: null,
  };
  const tryText = `Try ${state.attempt} of ${config.maxTries}`;

  switch (state.phase) {
    case 'DEMO':
      return {
        ...base,
        highlightIndex: context.demoIndex,
        status: state.demoReason === 'answer' ? 'The answer' : 'Listen',
        detail:
          state.demoReason === 'answer'
            ? 'Listen to the answer. Next phrase coming up.'
            : state.demoReason === 'idle'
              ? `Listen again. ${tryText}`
              : tryText,
      };
    case 'YOUR_TURN':
      return {
        ...base,
        status: 'Your turn',
        detail: `${tryText}  ·  ${state.strikes.length} of ${tones.length} strikes`,
      };
    case 'EVALUATE':
    case 'FEEDBACK': {
      const feedback = state.feedback;
      if (feedback === 'correct' && phrase !== null) {
        return {
          ...base,
          status: 'Well done',
          detail: tryText,
          stars: { earned: state.stars[phrase.id] ?? 0, max: 3 },
        };
      }
      if (feedback === 'answer') {
        return { ...base, status: 'Not this time', detail: 'Here is the answer.' };
      }
      const incomplete = state.lastResult !== null && !state.lastResult.complete;
      return {
        ...base,
        status: feedback === 'retry' ? 'Try again' : 'Checking',
        detail: `${incomplete ? 'Too few strikes' : 'Not quite'} on try ${state.attempt} of ${config.maxTries}`,
      };
    }
    default:
      return { ...base, status: '', detail: '' };
  }
}
