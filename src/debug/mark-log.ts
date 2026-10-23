/** One "mark" Fredrick makes during a Quest session ("that was a bad hit"), for later correlation. */
export interface DebugMark {
  /** 1-based mark number since load. */
  index: number;
  /** Seconds since the page loaded (performance.now() / 1000). */
  timeSec: number;
  /** Strike count and last strike speed / radial distance when the mark was made. */
  strikeCount: number;
  lastSpeedMps: number;
  lastRadialMeters: number;
  /** Lesson phase and phrase id at the time (empty outside a lesson). */
  phase: string;
  phraseId: string;
}

/**
 * Fixed-capacity ring buffer of marks. `push()` writes into pre-allocated slots (strings are stored
 * by reference), so making a mark never allocates; `toArray()` copies for tests and the console.
 */
export class MarkLog {
  private readonly slots: DebugMark[];
  private total = 0;

  constructor(readonly capacity: number) {
    this.slots = Array.from({ length: capacity }, () => ({
      index: 0,
      timeSec: 0,
      strikeCount: 0,
      lastSpeedMps: 0,
      lastRadialMeters: 0,
      phase: '',
      phraseId: '',
    }));
  }

  /** Marks made since load (may exceed capacity; only the newest `capacity` are kept). */
  get count(): number {
    return this.total;
  }

  push(
    timeSec: number,
    strikeCount: number,
    lastSpeedMps: number,
    lastRadialMeters: number,
    phase: string,
    phraseId: string,
  ): DebugMark {
    const slot = this.slots[this.total % this.capacity];
    this.total += 1;
    slot.index = this.total;
    slot.timeSec = timeSec;
    slot.strikeCount = strikeCount;
    slot.lastSpeedMps = lastSpeedMps;
    slot.lastRadialMeters = lastRadialMeters;
    slot.phase = phase;
    slot.phraseId = phraseId;
    return slot;
  }

  /** The n-th newest mark (0 = newest), or null. */
  newest(n: number): DebugMark | null {
    const kept = Math.min(this.total, this.capacity);
    if (n < 0 || n >= kept) {
      return null;
    }
    return this.slots[(this.total - 1 - n) % this.capacity];
  }

  /** Oldest-first copy of the kept marks. */
  toArray(): DebugMark[] {
    const kept = Math.min(this.total, this.capacity);
    const out: DebugMark[] = [];
    for (let n = kept - 1; n >= 0; n -= 1) {
      out.push({ ...this.newest(n)! });
    }
    return out;
  }
}
