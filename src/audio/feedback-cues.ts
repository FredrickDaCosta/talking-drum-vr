/**
 * Original procedural feedback cues (see docs/ASSET_REGISTER.md): a soft two-note "correct" chime
 * and a gentle falling "try again" tone. Rendered once at startup through an OfflineAudioContext
 * (no samples, no network), like the drum placeholder. Played non-spatially and quieter than the
 * drum (`APP_CONFIG.audio.cueGain`).
 */

import type { OfflineAudioContextFactory } from './gangan-placeholder.js';

export type FeedbackCueKind = 'correct' | 'retry';

export const CORRECT_CUE_DURATION_SEC = 0.7;
export const RETRY_CUE_DURATION_SEC = 0.45;

const defaultOfflineFactory: OfflineAudioContextFactory = (channels, length, sampleRate) =>
  new OfflineAudioContext(channels, length, sampleRate);

function bell(
  ctx: OfflineAudioContext,
  out: AudioNode,
  freq: number,
  startSec: number,
  peak: number,
  decaySec: number,
): void {
  for (const [ratio, level] of [
    [1, 1],
    [2, 0.25],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startSec);
    gain.gain.linearRampToValueAtTime(peak * level, startSec + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startSec + decaySec);
    osc.connect(gain).connect(out);
    osc.start(startSec);
    osc.stop(startSec + decaySec + 0.02);
  }
}

/** "Correct": two soft bell notes a fourth apart (G5 then C6). */
export function renderCorrectCue(
  sampleRate: number,
  createOffline: OfflineAudioContextFactory = defaultOfflineFactory,
): Promise<AudioBuffer> {
  const ctx = createOffline(1, Math.ceil(CORRECT_CUE_DURATION_SEC * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  bell(ctx, master, 784, 0, 0.8, 0.4);
  bell(ctx, master, 1047, 0.12, 0.8, 0.55);
  return ctx.startRendering();
}

/** "Try again": a low triangle tone gliding gently down (330 Hz to 247 Hz), low-passed. */
export function renderRetryCue(
  sampleRate: number,
  createOffline: OfflineAudioContextFactory = defaultOfflineFactory,
): Promise<AudioBuffer> {
  const ctx = createOffline(1, Math.ceil(RETRY_CUE_DURATION_SEC * sampleRate), sampleRate);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;
  filter.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(330, 0);
  osc.frequency.exponentialRampToValueAtTime(247, 0.3);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, 0);
  gain.gain.linearRampToValueAtTime(0.45, 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, RETRY_CUE_DURATION_SEC - 0.02);
  osc.connect(gain).connect(filter);
  osc.start(0);
  osc.stop(RETRY_CUE_DURATION_SEC);
  return ctx.startRendering();
}

export async function renderFeedbackCues(
  sampleRate: number,
  createOffline: OfflineAudioContextFactory = defaultOfflineFactory,
): Promise<Record<FeedbackCueKind, AudioBuffer>> {
  const [correct, retry] = await Promise.all([
    renderCorrectCue(sampleRate, createOffline),
    renderRetryCue(sampleRate, createOffline),
  ]);
  return { correct, retry };
}
