import type { LessonEntry } from './lesson-types.js';

export interface LessonValidationReport {
  readonly errors: string[];
  readonly countsByLevel: Record<1 | 2 | 3, number>;
  readonly draftIds: string[];
}

const TONES = new Set(['L', 'M', 'H']);

function isNfc(value: string): boolean {
  return value === value.normalize('NFC');
}

/**
 * Validates lesson content. Errors break `content:validate`; draft entries are only counted
 * (they are expected while Fredrick reviews the Yoruba).
 */
export function validateLessons(
  entries: readonly LessonEntry[],
  minEntriesPerLevel: Readonly<Record<1 | 2 | 3, number>>,
): LessonValidationReport {
  const errors: string[] = [];
  const countsByLevel: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  const draftIds: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const where = `entry "${entry.id}"`;
    if (!entry.id || seen.has(entry.id)) {
      errors.push(`${where}: id is empty or duplicated`);
    }
    seen.add(entry.id);
    if (entry.level !== 1 && entry.level !== 2 && entry.level !== 3) {
      errors.push(`${where}: level must be 1, 2 or 3`);
      continue;
    }
    countsByLevel[entry.level] += 1;
    if (entry.reviewStatus === 'draft') {
      draftIds.push(entry.id);
    } else if (entry.reviewStatus !== 'verified') {
      errors.push(`${where}: reviewStatus must be 'draft' or 'verified'`);
    }
    if (entry.syllables.length === 0) {
      errors.push(`${where}: needs at least one syllable`);
    }
    if (entry.tones.length !== entry.syllables.length) {
      errors.push(
        `${where}: ${entry.tones.length} tones for ${entry.syllables.length} syllables (must match)`,
      );
    }
    entry.tones.forEach((tone, i) => {
      if (!TONES.has(tone)) {
        errors.push(`${where}: tone ${i + 1} is "${String(tone)}" (only L, M or H)`);
      }
    });
    for (const [field, value] of [
      ['text', entry.text],
      ['gloss', entry.gloss],
      ['note', entry.note ?? ''],
      ...entry.syllables.map((s, i) => [`syllable ${i + 1}`, s] as const),
    ] as const) {
      if (!isNfc(value)) {
        errors.push(`${where}: ${field} is not Unicode NFC`);
      }
    }
    if (!entry.gloss.trim()) {
      errors.push(`${where}: gloss is empty`);
    }
    if (entry.level === 1) {
      if (entry.text !== '') {
        errors.push(`${where}: level-1 drills have no word (text must be empty)`);
      }
    } else {
      if (!entry.text.trim()) {
        errors.push(`${where}: text is empty`);
      }
      const spelled = entry.syllables.join('');
      const compact = entry.text.replace(/[\s-]/g, '');
      if (spelled !== compact) {
        errors.push(`${where}: syllables spell "${spelled}" but the text is "${entry.text}"`);
      }
    }
  }

  for (const level of [1, 2, 3] as const) {
    if (countsByLevel[level] < minEntriesPerLevel[level]) {
      errors.push(
        `level ${level}: ${countsByLevel[level]} entries, at least ${minEntriesPerLevel[level]} required`,
      );
    }
  }
  return { errors, countsByLevel, draftIds };
}
