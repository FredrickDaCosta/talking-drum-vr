import type { PitchBand } from '../app/config.js';

export type LessonLevel = 1 | 2 | 3;
export type ReviewStatus = 'draft' | 'verified';

/**
 * One phrase the drum "speaks". One strike = one syllable; `tones[i]` is the band of `syllables[i]`.
 * Level 1 entries are tone drills with no word (`text` is empty; syllables are beat numbers).
 */
export interface LessonEntry {
  readonly id: string;
  readonly level: LessonLevel;
  /** Yoruba text with proper diacritics, Unicode NFC (empty for level-1 drills). */
  readonly text: string;
  /** English meaning (or a short drill description for level 1). */
  readonly gloss: string;
  readonly syllables: readonly string[];
  readonly tones: readonly PitchBand[];
  readonly note?: string;
  /** 'draft' until Fredrick (or a native speaker) verifies text, split and tones. */
  readonly reviewStatus: ReviewStatus;
}
