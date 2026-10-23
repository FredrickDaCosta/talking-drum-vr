import { APP_CONFIG, type DrumAudioConfig } from '../app/config.js';
import { renderGanganPlaceholder } from './gangan-placeholder.js';

export interface DrumAudioPlayParams {
  /** Downward strike speed in m/s (DrumHit.speed); normalised and mapped to gain. */
  readonly velocity: number;
  /** Feeds AudioBufferSourceNode.playbackRate. Phase 2 drives it from the left-hand squeeze. */
  readonly pitchRatio?: number;
}

export type DrumAudioPlayOutcome =
  'played' | 'invalid-velocity' | 'no-context' | 'context-not-running' | 'buffer-not-ready';

export type DrumAudioContextState = AudioContextState | 'no-context' | 'unsupported';

export interface DrumAudioDiagnostics {
  contextState: DrumAudioContextState;
  /** AudioContext state observed by the first play() call (i.e. at the first strike). */
  contextStateAtFirstStrike: DrumAudioContextState | 'no-strike-yet';
  bufferReady: boolean;
  bufferDurationSec: number;
  bufferPeak: number;
  playCalls: number;
  voicesStartedCount: number;
  skippedCount: number;
  lastOutcome: DrumAudioPlayOutcome | 'none';
  lastGain: number;
  lastPlaybackRate: number;
  /** performance.now() at play() minus performance.now() at StrikeSystem frame entry (ms). */
  lastSoftwarePipelineMs: number;
  /** AudioContext.baseLatency in ms, NaN when unavailable. */
  baseLatencyMs: number;
  /** AudioContext.outputLatency in ms, NaN when unavailable. */
  outputLatencyMs: number;
}

/** Normalises strike speed over [minStrikeSpeedMps, maxStrikeSpeedMps] (clamped) to v in [0, 1]. */
export function normaliseStrikeSpeed(speedMps: number, config: DrumAudioConfig): number {
  const span = config.maxStrikeSpeedMps - config.minStrikeSpeedMps;
  const v = (speedMps - config.minStrikeSpeedMps) / span;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** g = minGain + (1 - minGain) * v^gainExponent, with v already in [0, 1]. */
export function velocityToGain(v: number, config: DrumAudioConfig): number {
  return config.minGain + (1 - config.minGain) * Math.pow(v, config.gainExponent);
}

export function strikeSpeedToGain(speedMps: number, config: DrumAudioConfig): number {
  return velocityToGain(normaliseStrikeSpeed(speedMps, config), config);
}

/** Missing or invalid (non-finite, <= 0) pitch ratios fall back to 1.0; valid ones are clamped. */
export function sanitisePitchRatio(
  pitchRatio: number | undefined,
  config: DrumAudioConfig,
): number {
  if (pitchRatio === undefined || !Number.isFinite(pitchRatio) || pitchRatio <= 0) {
    return 1;
  }
  return Math.min(config.maxPitchRatio, Math.max(config.minPitchRatio, pitchRatio));
}

function secondsToMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value * 1000 : Number.NaN;
}

export interface DrumAudioDeps {
  createContext: () => AudioContext;
  renderPlaceholder: (sampleRate: number) => Promise<AudioBuffer>;
  now: () => number;
  warn: (message: string, error?: unknown) => void;
}

const defaultDeps: DrumAudioDeps = {
  createContext: () => new AudioContext({ latencyHint: 'interactive' }),
  renderPlaceholder: (sampleRate) => renderGanganPlaceholder(sampleRate),
  now: () => performance.now(),
  warn: (message, error) => console.warn(message, error),
};

/**
 * Drum voice engine: one lazily created AudioContext, one pre-rendered buffer, an HRTF PannerNode
 * at the drum, and a fixed pool of per-voice GainNodes. Each hit creates only the one-shot
 * AudioBufferSourceNode the Web Audio API requires.
 *
 * Browsers only start audio after a user gesture, and a hand strike in XR is not one, so callers
 * must invoke `unlock()` from a click / pointer / key handler (see audio-unlock.ts and PanelSystem).
 */
export class DrumAudio {
  readonly diagnostics: DrumAudioDiagnostics = {
    contextState: 'no-context',
    contextStateAtFirstStrike: 'no-strike-yet',
    bufferReady: false,
    bufferDurationSec: 0,
    bufferPeak: 0,
    playCalls: 0,
    voicesStartedCount: 0,
    skippedCount: 0,
    lastOutcome: 'none',
    lastGain: 0,
    lastPlaybackRate: 1,
    lastSoftwarePipelineMs: Number.NaN,
    baseLatencyMs: Number.NaN,
    outputLatencyMs: Number.NaN,
  };

  private readonly config: DrumAudioConfig;
  private readonly deps: DrumAudioDeps;
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private panner: PannerNode | null = null;
  private readonly voices: GainNode[] = [];
  private nextVoice = 0;
  private preparePromise: Promise<void> | null = null;

  constructor(config: DrumAudioConfig = APP_CONFIG.audio, deps: Partial<DrumAudioDeps> = {}) {
    this.config = config;
    this.deps = { ...defaultDeps, ...deps };
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Renders the placeholder buffer once (idempotent). Does not need a user gesture. */
  prepare(): Promise<void> {
    if (this.preparePromise === null) {
      this.preparePromise = this.deps
        .renderPlaceholder(this.config.placeholderSampleRateHz)
        .then((buffer) => {
          if (this.buffer === null) {
            this.setBuffer(buffer);
          }
        })
        .catch((error: unknown) => {
          this.deps.warn('[DrumAudio] Placeholder render failed; strikes will be silent.', error);
        });
    }
    return this.preparePromise;
  }

  /** Swap in any decoded buffer (e.g. Fredrick's studio recording). */
  setBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
    let peak = 0;
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const a = Math.abs(data[i]);
      if (a > peak) {
        peak = a;
      }
    }
    this.diagnostics.bufferReady = true;
    this.diagnostics.bufferDurationSec = buffer.duration;
    this.diagnostics.bufferPeak = peak;
  }

  /** Decodes an encoded sample (wav/ogg/mp3 bytes) and makes it the drum voice. Needs unlock() first. */
  async decodeSample(data: ArrayBuffer): Promise<void> {
    if (this.ctx === null) {
      throw new Error(
        'DrumAudio.decodeSample() requires unlock() to have created the AudioContext',
      );
    }
    this.setBuffer(await this.ctx.decodeAudioData(data));
  }

  /**
   * Creates the AudioContext on first call and resumes it. Must run synchronously inside a user
   * gesture handler (click / pointerdown / keydown) for the browser to allow playback.
   */
  unlock(): void {
    if (this.ctx === null) {
      try {
        this.ctx = this.deps.createContext();
      } catch (error: unknown) {
        this.diagnostics.contextState = 'unsupported';
        this.deps.warn('[DrumAudio] Web Audio is unavailable; strikes will be silent.', error);
        return;
      }
      this.buildGraph(this.ctx);
      this.ctx.addEventListener?.('statechange', this.onStateChange);
    }
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      this.ctx.resume().catch((error: unknown) => {
        this.deps.warn('[DrumAudio] AudioContext.resume() was rejected.', error);
      });
    }
    this.refreshContextDiagnostics();
  }

  setDrumPosition(x: number, y: number, z: number): void {
    const panner = this.panner;
    if (panner === null) {
      return;
    }
    if (panner.positionX !== undefined) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, y, z);
    }
  }

  setListenerPose(
    px: number,
    py: number,
    pz: number,
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
  ): void {
    const listener = this.ctx?.listener;
    if (listener == null) {
      return;
    }
    if (listener.positionX !== undefined) {
      listener.positionX.value = px;
      listener.positionY.value = py;
      listener.positionZ.value = pz;
      listener.forwardX.value = fx;
      listener.forwardY.value = fy;
      listener.forwardZ.value = fz;
      listener.upX.value = ux;
      listener.upY.value = uy;
      listener.upZ.value = uz;
    } else {
      listener.setPosition(px, py, pz);
      listener.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  /**
   * Starts one drum voice. `frameEntryPerfNowMs` (performance.now() at StrikeSystem frame entry)
   * feeds the debug software-pipeline probe only; it is not a tracking or end-to-end latency.
   */
  play(params: DrumAudioPlayParams, frameEntryPerfNowMs = Number.NaN): DrumAudioPlayOutcome {
    const d = this.diagnostics;
    d.playCalls += 1;
    this.refreshContextDiagnostics();
    if (d.contextStateAtFirstStrike === 'no-strike-yet') {
      d.contextStateAtFirstStrike = d.contextState;
    }

    const outcome = this.startVoice(params, frameEntryPerfNowMs);
    d.lastOutcome = outcome;
    if (outcome === 'played') {
      d.voicesStartedCount += 1;
    } else {
      d.skippedCount += 1;
    }
    return outcome;
  }

  refreshContextDiagnostics(): void {
    const ctx = this.ctx;
    if (ctx === null) {
      return;
    }
    this.diagnostics.contextState = ctx.state;
    this.diagnostics.baseLatencyMs = secondsToMs(ctx.baseLatency);
    this.diagnostics.outputLatencyMs = secondsToMs(ctx.outputLatency);
  }

  private startVoice(
    params: DrumAudioPlayParams,
    frameEntryPerfNowMs: number,
  ): DrumAudioPlayOutcome {
    if (typeof params?.velocity !== 'number' || !Number.isFinite(params.velocity)) {
      return 'invalid-velocity';
    }
    const ctx = this.ctx;
    if (ctx === null || this.panner === null) {
      return 'no-context';
    }
    if (ctx.state !== 'running') {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {
          // Without a gesture this is expected to fail; unlock() reports the real failure.
        });
      }
      return 'context-not-running';
    }
    if (this.buffer === null) {
      return 'buffer-not-ready';
    }

    const gain = strikeSpeedToGain(params.velocity, this.config);
    const playbackRate = sanitisePitchRatio(params.pitchRatio, this.config);

    const voiceGain = this.voices[this.nextVoice];
    this.nextVoice = (this.nextVoice + 1) % this.voices.length;
    voiceGain.gain.value = gain;

    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = playbackRate;
    source.connect(voiceGain);

    this.diagnostics.lastSoftwarePipelineMs = this.deps.now() - frameEntryPerfNowMs;
    source.start(0);

    this.diagnostics.lastGain = gain;
    this.diagnostics.lastPlaybackRate = playbackRate;
    return 'played';
  }

  private buildGraph(ctx: AudioContext): void {
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = this.config.pannerRefDistanceMeters;
    panner.connect(ctx.destination);
    this.panner = panner;

    for (let i = 0; i < this.config.voicePoolSize; i += 1) {
      const voiceGain = ctx.createGain();
      voiceGain.connect(panner);
      this.voices.push(voiceGain);
    }
  }

  private readonly onStateChange = (): void => {
    this.refreshContextDiagnostics();
  };
}
