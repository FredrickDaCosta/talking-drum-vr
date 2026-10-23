import { describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../../src/app/config.js';
import {
  DrumAudio,
  type DrumAudioDeps,
  normaliseStrikeSpeed,
  sanitisePitchRatio,
  strikeSpeedToGain,
  velocityToGain,
} from '../../src/audio/drum-audio.js';
import { createSeededRandom } from '../../src/audio/gangan-placeholder.js';

const audioConfig = APP_CONFIG.audio;

interface MockParam {
  value: number;
}

function createMockContext(initialState: AudioContextState = 'running') {
  const sources: Array<{
    buffer: unknown;
    playbackRate: MockParam;
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  }> = [];
  const gains: Array<{
    gain: MockParam & { setValueAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
  }> = [];
  const param = (): MockParam => ({ value: 0 });
  const ctx = {
    state: initialState as AudioContextState,
    currentTime: 0,
    baseLatency: 0.005 as number | undefined,
    outputLatency: undefined as number | undefined,
    destination: {},
    listener: {
      positionX: param(),
      positionY: param(),
      positionZ: param(),
      forwardX: param(),
      forwardY: param(),
      forwardZ: param(),
      upX: param(),
      upY: param(),
      upZ: param(),
    },
    resume: vi.fn(() => {
      ctx.state = 'running';
      return Promise.resolve();
    }),
    addEventListener: vi.fn(),
    decodeAudioData: vi.fn(),
    createPanner: vi.fn(() => ({
      panningModel: '',
      distanceModel: '',
      refDistance: 0,
      positionX: param(),
      positionY: param(),
      positionZ: param(),
      connect: vi.fn(),
    })),
    createGain: vi.fn(() => {
      const g = { gain: { value: 1, setValueAtTime: vi.fn() }, connect: vi.fn() };
      gains.push(g);
      return g;
    }),
    createBufferSource: vi.fn(() => {
      const s = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        connect: vi.fn(),
        start: vi.fn(),
      };
      sources.push(s);
      return s;
    }),
  };
  return { ctx, sources, gains };
}

function createMockBuffer(peak = 0.8) {
  const data = new Float32Array([0, peak, -peak / 2, 0]);
  return { duration: 0.65, getChannelData: () => data } as unknown as AudioBuffer;
}

function createReadyDrumAudio(
  state: AudioContextState = 'running',
  nowMs = 1000,
  extraDeps: Partial<DrumAudioDeps> = {},
) {
  const mock = createMockContext(state);
  const audio = new DrumAudio(audioConfig, {
    createContext: () => mock.ctx as unknown as AudioContext,
    renderPlaceholder: () => Promise.resolve(createMockBuffer()),
    now: () => nowMs,
    warn: () => {},
    hasUserActivation: () => true,
    ...extraDeps,
  });
  return { audio, ...mock };
}

describe('velocity-to-gain mapping', () => {
  it('normalises 0.30..3.0 m/s to 0..1 and clamps outside the range', () => {
    expect(normaliseStrikeSpeed(0.3, audioConfig)).toBe(0);
    expect(normaliseStrikeSpeed(3.0, audioConfig)).toBe(1);
    expect(normaliseStrikeSpeed(1.65, audioConfig)).toBeCloseTo(0.5, 12);
    expect(normaliseStrikeSpeed(0.1, audioConfig)).toBe(0);
    expect(normaliseStrikeSpeed(-2, audioConfig)).toBe(0);
    expect(normaliseStrikeSpeed(9, audioConfig)).toBe(1);
  });

  it('maps v to g = 0.15 + 0.85 * v^0.75', () => {
    expect(velocityToGain(0, audioConfig)).toBeCloseTo(0.15, 12);
    expect(velocityToGain(1, audioConfig)).toBeCloseTo(1, 12);
    expect(velocityToGain(0.5, audioConfig)).toBeCloseTo(0.15 + 0.85 * Math.pow(0.5, 0.75), 12);
    expect(strikeSpeedToGain(1.65, audioConfig)).toBeCloseTo(0.655413, 5);
  });

  it('is monotonic non-decreasing and stays within [0.15, 1]', () => {
    let previous = -Infinity;
    for (let speed = 0; speed <= 4; speed += 0.05) {
      const g = strikeSpeedToGain(speed, audioConfig);
      expect(g).toBeGreaterThanOrEqual(previous);
      expect(g).toBeGreaterThanOrEqual(0.15);
      expect(g).toBeLessThanOrEqual(1);
      previous = g;
    }
  });
});

describe('pitchRatio handling', () => {
  it('defaults to 1.0 and falls back to 1.0 for invalid values', () => {
    expect(sanitisePitchRatio(undefined, audioConfig)).toBe(1);
    expect(sanitisePitchRatio(Number.NaN, audioConfig)).toBe(1);
    expect(sanitisePitchRatio(Infinity, audioConfig)).toBe(1);
    expect(sanitisePitchRatio(0, audioConfig)).toBe(1);
    expect(sanitisePitchRatio(-1, audioConfig)).toBe(1);
  });

  it('clamps valid ratios to [0.5, 2.0]', () => {
    expect(sanitisePitchRatio(1.25, audioConfig)).toBe(1.25);
    expect(sanitisePitchRatio(0.1, audioConfig)).toBe(0.5);
    expect(sanitisePitchRatio(5, audioConfig)).toBe(2);
  });
});

describe('DrumAudio.play() with a mocked AudioContext', () => {
  it('reports no-context before unlock() and records the first-strike state', async () => {
    const { audio, sources } = createReadyDrumAudio();
    await audio.prepare();
    expect(audio.play({ velocity: 1 })).toBe('no-context');
    expect(audio.diagnostics.contextStateAtFirstStrike).toBe('no-context');
    expect(audio.diagnostics.voicesStartedCount).toBe(0);
    expect(audio.diagnostics.skippedCount).toBe(1);
    expect(sources).toHaveLength(0);
  });

  it('unlock() creates one context lazily and resumes it when suspended', () => {
    const { audio, ctx } = createReadyDrumAudio('suspended');
    expect(audio.context).toBeNull();
    audio.unlock();
    audio.unlock();
    expect(audio.context).toBe(ctx);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.createPanner).toHaveBeenCalledTimes(1);
  });

  it('skips without starting a voice while the context is suspended', async () => {
    const { audio, ctx, sources } = createReadyDrumAudio('suspended');
    ctx.resume.mockImplementation(() => Promise.resolve());
    await audio.prepare();
    audio.unlock();
    expect(audio.play({ velocity: 1 })).toBe('context-not-running');
    expect(audio.diagnostics.contextStateAtFirstStrike).toBe('suspended');
    expect(sources).toHaveLength(0);
  });

  it('reports buffer-not-ready before the placeholder has rendered', () => {
    const { audio } = createReadyDrumAudio();
    audio.unlock();
    expect(audio.play({ velocity: 1 })).toBe('buffer-not-ready');
  });

  it('starts one voice with mapped gain and pitchRatio as playbackRate', async () => {
    const { audio, sources, gains } = createReadyDrumAudio('running', 1003.5);
    await audio.prepare();
    audio.unlock();
    expect(audio.play({ velocity: 1.65, pitchRatio: 1.5 }, 1000)).toBe('played');

    expect(sources).toHaveLength(1);
    const source = sources[0];
    expect(source.buffer).not.toBeNull();
    expect(source.playbackRate.value).toBe(1.5);
    expect(source.start).toHaveBeenCalledWith(0);
    expect(source.connect).toHaveBeenCalledWith(gains[0]);
    expect(gains[0].gain.value).toBeCloseTo(0.655413, 5);
    expect(audio.diagnostics.voicesStartedCount).toBe(1);
    expect(audio.diagnostics.contextStateAtFirstStrike).toBe('running');
    expect(audio.diagnostics.lastSoftwarePipelineMs).toBeCloseTo(3.5, 9);
    expect(audio.diagnostics.lastPlaybackRate).toBe(1.5);
  });

  it('defaults pitchRatio to 1.0 and ignores invalid velocities', async () => {
    const { audio, sources } = createReadyDrumAudio();
    await audio.prepare();
    audio.unlock();
    expect(audio.play({ velocity: 0.5 })).toBe('played');
    expect(sources[0].playbackRate.value).toBe(1);

    expect(audio.play({ velocity: Number.NaN })).toBe('invalid-velocity');
    expect(audio.play({ velocity: Infinity })).toBe('invalid-velocity');
    expect(audio.play({ velocity: '2' as unknown as number })).toBe('invalid-velocity');
    expect(audio.play(undefined as unknown as { velocity: number })).toBe('invalid-velocity');
    expect(sources).toHaveLength(1);
    expect(audio.diagnostics.voicesStartedCount).toBe(1);
    expect(audio.diagnostics.skippedCount).toBe(4);
  });

  it('reuses the pre-allocated voice gain pool round-robin (no GainNode per hit)', async () => {
    const { audio, ctx, sources, gains } = createReadyDrumAudio();
    await audio.prepare();
    audio.unlock();
    const poolSize = audioConfig.voicePoolSize;
    expect(ctx.createGain).toHaveBeenCalledTimes(poolSize);
    for (let i = 0; i < poolSize + 2; i += 1) {
      audio.play({ velocity: 1 });
    }
    expect(ctx.createGain).toHaveBeenCalledTimes(poolSize);
    expect(sources[poolSize].connect).toHaveBeenCalledWith(gains[0]);
    expect(sources[poolSize + 1].connect).toHaveBeenCalledWith(gains[1]);
  });

  it('reports baseLatency in ms and outputLatency as NaN when undefined', () => {
    const { audio } = createReadyDrumAudio();
    audio.unlock();
    expect(audio.diagnostics.baseLatencyMs).toBeCloseTo(5, 9);
    expect(Number.isNaN(audio.diagnostics.outputLatencyMs)).toBe(true);
  });

  it('marks audio unsupported when AudioContext construction throws', () => {
    const warn = vi.fn();
    const audio = new DrumAudio(audioConfig, {
      createContext: () => {
        throw new Error('no web audio');
      },
      warn,
    });
    audio.unlock();
    expect(audio.diagnostics.contextState).toBe('unsupported');
    expect(audio.play({ velocity: 1 })).toBe('no-context');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('records buffer diagnostics and warns (not throws) if the placeholder render fails', async () => {
    const warn = vi.fn();
    const failing = new DrumAudio(audioConfig, {
      renderPlaceholder: () => Promise.reject(new Error('render failed')),
      warn,
    });
    await failing.prepare();
    expect(failing.diagnostics.bufferReady).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);

    const { audio } = createReadyDrumAudio();
    await audio.prepare();
    expect(audio.diagnostics.bufferReady).toBe(true);
    expect(audio.diagnostics.bufferDurationSec).toBe(0.65);
    expect(audio.diagnostics.bufferPeak).toBeCloseTo(0.8, 6);
  });

  it('moves the panner and listener through AudioParams', () => {
    const { audio, ctx } = createReadyDrumAudio();
    audio.unlock();
    audio.setListenerPose(0, 1.6, 0, 0, 0, -1, 0, 1, 0);
    expect(ctx.listener.positionY.value).toBe(1.6);
    expect(ctx.listener.forwardZ.value).toBe(-1);
    expect(ctx.listener.upY.value).toBe(1);
  });
});

describe('gángan placeholder noise source', () => {
  it('is deterministic and stays within [0, 1)', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    for (let i = 0; i < 1000; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('DrumAudio voice and skip diagnostics', () => {
  it('counts active voices from the fixed per-voice end-time array (started stays cumulative)', async () => {
    const { audio, ctx } = createReadyDrumAudio();
    await audio.prepare();
    audio.unlock();
    ctx.currentTime = 10;
    audio.play({ velocity: 1 });
    ctx.currentTime = 10.3;
    audio.play({ velocity: 1, pitchRatio: 2 }); // 0.65 s / 2 = ends at 10.625
    audio.refreshContextDiagnostics();
    expect(audio.diagnostics.voicesStartedCount).toBe(2);
    expect(audio.diagnostics.activeVoices).toBe(2);
    ctx.currentTime = 10.64; // first ends at 10.65, second ended at 10.625
    audio.refreshContextDiagnostics();
    expect(audio.diagnostics.activeVoices).toBe(1);
    ctx.currentTime = 11;
    audio.refreshContextDiagnostics();
    expect(audio.diagnostics.activeVoices).toBe(0);
    expect(audio.diagnostics.voicesStartedCount).toBe(2);
  });

  it('counts skips by reason', async () => {
    const { audio, ctx } = createReadyDrumAudio('running');
    audio.play({ velocity: 1 }); // no context yet
    audio.unlock();
    audio.play({ velocity: 1 }); // buffer not ready
    await audio.prepare();
    audio.play({ velocity: Number.NaN }); // invalid
    ctx.state = 'suspended';
    ctx.resume.mockImplementation(() => Promise.resolve());
    audio.play({ velocity: 1 }); // not running
    expect(audio.diagnostics.skipped).toEqual({
      noContext: 1,
      contextNotRunning: 1,
      bufferNotReady: 1,
      invalidVelocity: 1,
    });
    expect(audio.diagnostics.skippedCount).toBe(4);
  });
});

describe('DrumAudio safe resume handler', () => {
  it('does nothing without a context or while running', () => {
    const { audio, ctx } = createReadyDrumAudio('running');
    audio.requestResume('visibility');
    audio.unlock();
    audio.requestResume('visibility');
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(audio.diagnostics.resumeRequests).toBe(0);
  });

  it('resumes a suspended or interrupted context only after a user gesture', () => {
    let activated = false;
    const { audio, ctx } = createReadyDrumAudio('running', 1000, {
      hasUserActivation: () => activated,
    });
    audio.unlock();
    ctx.state = 'suspended';
    audio.requestResume('xr-session');
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(audio.diagnostics.resumeDeferredNoGesture).toBe(1);

    activated = true;
    audio.requestResume('xr-session');
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(audio.diagnostics.lastResumeReason).toBe('xr-session');

    ctx.state = 'interrupted' as AudioContextState;
    audio.requestResume('visibility');
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it('falls back to "unlock() was called" when navigator.userActivation is unavailable', () => {
    const { audio, ctx } = createReadyDrumAudio('running', 1000, {
      hasUserActivation: () => undefined,
    });
    audio.unlock();
    ctx.state = 'suspended';
    audio.requestResume('visibility');
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('logs a rejected resume() as a warning, never throws', async () => {
    const warn = vi.fn();
    const { audio, ctx } = createReadyDrumAudio('running', 1000, { warn });
    audio.unlock();
    ctx.state = 'suspended';
    ctx.resume.mockImplementation(() => Promise.reject(new Error('blocked')));
    expect(() => audio.requestResume('visibility')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('(visibility)');
  });

  it('requests a resume on statechange to suspended', () => {
    const { audio, ctx } = createReadyDrumAudio('running');
    audio.unlock();
    const handler = ctx.addEventListener.mock.calls.find((c) => c[0] === 'statechange')?.[1] as
      (() => void) | undefined;
    expect(handler).toBeTypeOf('function');
    ctx.state = 'suspended';
    handler?.();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(audio.diagnostics.lastResumeReason).toBe('statechange');
    expect(audio.diagnostics.contextState).toBe('suspended');
  });

  it('keeps a hit during a non-running context skipped and never plays it late', async () => {
    const { audio, ctx, sources } = createReadyDrumAudio('running');
    await audio.prepare();
    audio.unlock();
    ctx.state = 'suspended';
    expect(audio.play({ velocity: 1 })).toBe('context-not-running');
    expect(ctx.resume).toHaveBeenCalledTimes(1); // resume requested by the strike...
    expect(ctx.state).toBe('running'); // ...and the mock resumed immediately,
    await Promise.resolve();
    expect(sources).toHaveLength(0); // but the skipped hit is never started afterwards.
    expect(audio.play({ velocity: 1 })).toBe('played'); // the next hit plays normally
    expect(sources).toHaveLength(1);
  });
});

describe('DrumAudio.playAt (lesson demos on the audio clock)', () => {
  it('schedules voices at AudioContext times with the gain applied at the start time', async () => {
    const { audio, ctx, sources, gains } = createReadyDrumAudio();
    await audio.prepare();
    audio.unlock();
    ctx.currentTime = 10;
    expect(audio.currentTime).toBe(10);
    expect(audio.playAt(10.15, { velocity: 1.5, pitchRatio: 0.75 })).toBe('played');
    expect(audio.playAt(10.75, { velocity: 1.5, pitchRatio: 1.33 })).toBe('played');

    expect(sources).toHaveLength(2);
    expect(sources[0].start).toHaveBeenCalledWith(10.15);
    expect(sources[1].start).toHaveBeenCalledWith(10.75);
    expect(sources[0].playbackRate.value).toBe(0.75);
    expect(sources[1].playbackRate.value).toBe(1.33);
    const g = strikeSpeedToGain(1.5, audioConfig);
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(g, 10.15);
    expect(gains[1].gain.setValueAtTime).toHaveBeenCalledWith(g, 10.75);
    // The gain a currently sounding voice uses is not changed immediately.
    expect(gains[0].gain.value).toBe(1);
  });

  it('keeps strike diagnostics separate and counts scheduled voices', async () => {
    const { audio } = createReadyDrumAudio();
    await audio.prepare();
    audio.unlock();
    audio.playAt(0.5, { velocity: 1 });
    const d = audio.diagnostics;
    expect(d.scheduledCalls).toBe(1);
    expect(d.scheduledVoices).toBe(1);
    expect(d.playCalls).toBe(0);
    expect(d.voicesStartedCount).toBe(0);
    expect(d.contextStateAtFirstStrike).toBe('no-strike-yet');
    expect(Number.isNaN(d.lastSoftwarePipelineMs)).toBe(true);
  });

  it('starts a past time immediately and counts it as active until it ends', async () => {
    const { audio, ctx, sources } = createReadyDrumAudio();
    await audio.prepare();
    audio.unlock();
    ctx.currentTime = 5;
    audio.playAt(4, { velocity: 1 });
    expect(sources[0].start).toHaveBeenCalledWith(5);
    audio.refreshContextDiagnostics();
    expect(audio.diagnostics.activeVoices).toBe(1);
    ctx.currentTime = 5 + 0.65 + 0.01;
    audio.refreshContextDiagnostics();
    expect(audio.diagnostics.activeVoices).toBe(0);
  });

  it('rejects a non-finite time and plays nothing without a running context', async () => {
    const { audio, ctx, sources } = createReadyDrumAudio('suspended');
    ctx.resume.mockImplementation(() => Promise.resolve());
    expect(Number.isNaN(audio.currentTime)).toBe(true);
    expect(audio.playAt(1, { velocity: 1 })).toBe('no-context');
    await audio.prepare();
    audio.unlock();
    expect(audio.playAt(Number.NaN, { velocity: 1 })).toBe('invalid-time');
    expect(audio.playAt(1, { velocity: 1 })).toBe('context-not-running');
    expect(sources).toHaveLength(0);
    expect(audio.diagnostics.scheduledVoices).toBe(0);
  });
});
