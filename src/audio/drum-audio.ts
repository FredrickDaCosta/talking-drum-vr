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

/** Why a resume was requested (debug diagnostics only). */
export type DrumAudioResumeReason = 'statechange' | 'visibility' | 'xr-session' | 'strike';

/** Per-reason counts of play() calls that did not start a voice. */
export interface DrumAudioSkipCounts {
  noContext: number;
  contextNotRunning: number;
  bufferNotReady: number;
  invalidVelocity: number;
}

export interface DrumAudioDiagnostics {
  contextState: DrumAudioContextState;
  /** AudioContext state observed by the first play() call (i.e. at the first strike). */
  contextStateAtFirstStrike: DrumAudioContextState | 'no-strike-yet';
  bufferReady: boolean;
  bufferDurationSec: number;
  bufferPeak: number;
  playCalls: number;
  /** Cumulative number of voices started since load (not the number currently sounding). */
  voicesStartedCount: number;
  /** Voices still sounding as of the last refreshContextDiagnostics() call. */
  activeVoices: number;
  skippedCount: number;
  skipped: DrumAudioSkipCounts;
  /** resume() calls issued by requestResume(), and requests ignored because no gesture has happened yet. */
  resumeRequests: number;
  resumeDeferredNoGesture: number;
  lastResumeReason: DrumAudioResumeReason | 'none';
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
  /** True once the page has had a user activation (navigator.userActivation.hasBeenActive). */
  hasUserActivation: () => boolean | undefined;
}

const defaultDeps: DrumAudioDeps = {
  createContext: () => new AudioContext({ latencyHint: 'interactive' }),
  renderPlaceholder: (sampleRate) => renderGanganPlaceholder(sampleRate),
  now: () => performance.now(),
  warn: (message, error) => console.warn(message, error),
  hasUserActivation: () =>
    typeof navigator === 'undefined' ? undefined : navigator.userActivation?.hasBeenActive,
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
    activeVoices: 0,
    skippedCount: 0,
    skipped: { noContext: 0, contextNotRunning: 0, bufferNotReady: 0, invalidVelocity: 0 },
    resumeRequests: 0,
    resumeDeferredNoGesture: 0,
    lastResumeReason: 'none',
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
  /** AudioContext time at which each pooled voice's current sound ends (fixed size, no per-hit allocation). */
  private readonly voiceEndTimes: Float64Array;
  private nextVoice = 0;
  private unlocked = false;
  private preparePromise: Promise<void> | null = null;

  constructor(config: DrumAudioConfig = APP_CONFIG.audio, deps: Partial<DrumAudioDeps> = {}) {
    this.config = config;
    this.deps = { ...defaultDeps, ...deps };
    this.voiceEndTimes = new Float64Array(config.voicePoolSize);
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
    this.unlocked = true;
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

  /**
   * Safe resume for a context the browser or OS suspended mid-session (state change, tab becoming
   * visible again, XR session start/end, or a strike). Only issues resume() after the page has had
   * a user gesture; failures are logged as warnings. It never plays anything: a hit that arrives
   * while the context is not running stays skipped rather than being played late.
   */
  requestResume(reason: DrumAudioResumeReason): void {
    const ctx = this.ctx;
    if (ctx === null) {
      return;
    }
    const state = ctx.state as string;
    if (state !== 'suspended' && state !== 'interrupted') {
      return;
    }
    if (!(this.deps.hasUserActivation() ?? this.unlocked)) {
      this.diagnostics.resumeDeferredNoGesture += 1;
      return;
    }
    this.diagnostics.resumeRequests += 1;
    this.diagnostics.lastResumeReason = reason;
    ctx.resume().catch((error: unknown) => {
      this.deps.warn(`[DrumAudio] AudioContext.resume() (${reason}) was rejected.`, error);
    });
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
      if (outcome === 'no-context') {
        d.skipped.noContext += 1;
      } else if (outcome === 'context-not-running') {
        d.skipped.contextNotRunning += 1;
      } else if (outcome === 'buffer-not-ready') {
        d.skipped.bufferNotReady += 1;
      } else {
        d.skipped.invalidVelocity += 1;
      }
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
    let active = 0;
    const now = ctx.currentTime;
    for (let i = 0; i < this.voiceEndTimes.length; i += 1) {
      if (this.voiceEndTimes[i] > now) {
        active += 1;
      }
    }
    this.diagnostics.activeVoices = active;
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
      this.requestResume('strike');
      return 'context-not-running';
    }
    if (this.buffer === null) {
      return 'buffer-not-ready';
    }

    const gain = strikeSpeedToGain(params.velocity, this.config);
    const playbackRate = sanitisePitchRatio(params.pitchRatio, this.config);

    const voiceIndex = this.nextVoice;
    const voiceGain = this.voices[voiceIndex];
    this.nextVoice = (voiceIndex + 1) % this.voices.length;
    voiceGain.gain.value = gain;

    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = playbackRate;
    source.connect(voiceGain);

    this.diagnostics.lastSoftwarePipelineMs = this.deps.now() - frameEntryPerfNowMs;
    source.start(0);
    this.voiceEndTimes[voiceIndex] = ctx.currentTime + this.buffer.duration / playbackRate;

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
    this.requestResume('statechange');
  };
}
