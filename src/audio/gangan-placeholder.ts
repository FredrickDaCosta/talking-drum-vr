/**
 * Original procedural gángan placeholder (see docs/ASSET_REGISTER.md).
 * Placeholder — to be replaced by Fredrick's original recording via `DrumAudio.setBuffer()` /
 * `DrumAudio.decodeSample()`; nothing else depends on how this buffer is produced.
 *
 * Rendered once at startup through an `OfflineAudioContext` (no user gesture needed, no network):
 * - pitched membrane body: sine gliding 190 Hz -> 128 Hz (the talking drum's falling "speech" tone),
 * - a quieter inharmonic overtone (x2.27) that dies away faster,
 * - a short band-passed noise burst for the stick/palm attack,
 * all under fast-attack exponential-decay envelopes.
 */

export const GANGAN_PLACEHOLDER_DURATION_SEC = 0.65;

export type OfflineAudioContextFactory = (
  numberOfChannels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContext;

const defaultOfflineFactory: OfflineAudioContextFactory = (channels, length, sampleRate) =>
  new OfflineAudioContext(channels, length, sampleRate);

/** Deterministic PRNG (mulberry32) so the placeholder renders identically on every load. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scheduleEnvelope(
  param: AudioParam,
  peak: number,
  attackSec: number,
  decaySec: number,
): void {
  param.setValueAtTime(0.0001, 0);
  param.linearRampToValueAtTime(peak, attackSec);
  param.exponentialRampToValueAtTime(0.0001, attackSec + decaySec);
}

export async function renderGanganPlaceholder(
  sampleRate: number,
  createOffline: OfflineAudioContextFactory = defaultOfflineFactory,
): Promise<AudioBuffer> {
  const length = Math.ceil(GANGAN_PLACEHOLDER_DURATION_SEC * sampleRate);
  const ctx = createOffline(1, length, sampleRate);

  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);

  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(190, 0);
  body.frequency.exponentialRampToValueAtTime(128, 0.18);
  const bodyGain = ctx.createGain();
  scheduleEnvelope(bodyGain.gain, 1.0, 0.003, 0.6);
  body.connect(bodyGain).connect(master);

  const overtone = ctx.createOscillator();
  overtone.type = 'sine';
  overtone.frequency.setValueAtTime(190 * 2.27, 0);
  overtone.frequency.exponentialRampToValueAtTime(128 * 2.27, 0.18);
  const overtoneGain = ctx.createGain();
  scheduleEnvelope(overtoneGain.gain, 0.35, 0.002, 0.25);
  overtone.connect(overtoneGain).connect(master);

  const noiseLength = Math.ceil(0.08 * sampleRate);
  const noiseBuffer = ctx.createBuffer(1, noiseLength, sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  const random = createSeededRandom(0x6a616e);
  for (let i = 0; i < noiseLength; i += 1) {
    noiseData[i] = random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 1800;
  noiseFilter.Q.value = 0.8;
  const noiseGain = ctx.createGain();
  scheduleEnvelope(noiseGain.gain, 0.5, 0.001, 0.06);
  noise.connect(noiseFilter).connect(noiseGain).connect(master);

  body.start(0);
  overtone.start(0);
  noise.start(0);
  body.stop(GANGAN_PLACEHOLDER_DURATION_SEC);
  overtone.stop(GANGAN_PLACEHOLDER_DURATION_SEC);

  return ctx.startRendering();
}
