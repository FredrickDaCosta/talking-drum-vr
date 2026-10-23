export const CONTROLLERS_ONLY_MESSAGE =
  'Only controllers are active — please put your controllers down and enable hand tracking to play the talking drum.';

export const NO_HANDS_MESSAGE =
  'Hand tracking not detected — please enable hand tracking on your headset to play the talking drum.';

export type XrInputNoticeState = 'pending' | 'hands-present' | 'controllers-only' | 'no-input';

export interface XrInputCounts {
  hands: number;
  controllers: number;
}

interface InputSourceLike {
  readonly hand?: unknown;
  readonly targetRayMode?: string;
}

/** Counts tracked hands and hand-less tracked-pointer sources (controllers) without allocating. */
export function countXrInputSourcesInto(
  sources: ArrayLike<InputSourceLike> | null | undefined,
  out: XrInputCounts,
): XrInputCounts {
  out.hands = 0;
  out.controllers = 0;
  if (sources == null) {
    return out;
  }
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    if (source.hand != null) {
      out.hands += 1;
    } else if (source.targetRayMode === 'tracked-pointer') {
      out.controllers += 1;
    }
  }
  return out;
}

/**
 * Decides whether to show the hands-required notice. Hands must have been absent for the full
 * grace window (measured from session start or the last time a hand was seen) before the notice
 * appears, so a short tracking dropout does not flash it.
 */
export function evaluateXrInputNotice(
  nowMs: number,
  sessionStartMs: number,
  lastHandSeenMs: number,
  counts: Readonly<XrInputCounts>,
  graceMs: number,
): XrInputNoticeState {
  if (counts.hands > 0) {
    return 'hands-present';
  }
  const absentSinceMs = Math.max(sessionStartMs, lastHandSeenMs);
  if (nowMs - absentSinceMs < graceMs) {
    return 'pending';
  }
  return counts.controllers > 0 ? 'controllers-only' : 'no-input';
}

export function xrInputNoticeMessage(state: XrInputNoticeState): string | null {
  if (state === 'controllers-only') {
    return CONTROLLERS_ONLY_MESSAGE;
  }
  if (state === 'no-input') {
    return NO_HANDS_MESSAGE;
  }
  return null;
}
