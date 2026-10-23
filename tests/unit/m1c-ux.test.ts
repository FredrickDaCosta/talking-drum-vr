import { Euler, Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import { describe, expect, it, vi } from 'vitest';
import { LOADING_ERROR_MESSAGE, trackStartupWithBanner } from '../../src/app/loading-banner.js';
import { AUDIO_PROBE_LABEL, formatAudioProbe } from '../../src/debug/debug-hud.js';
import {
  composeReferenceSpaceToDrumLocal,
  isIdentityMatrixElements,
} from '../../src/input/reference-space.js';
import {
  CONTROLLERS_ONLY_MESSAGE,
  countXrInputSourcesInto,
  evaluateXrInputNotice,
  NO_HANDS_MESSAGE,
  xrInputNoticeMessage,
} from '../../src/platform/xr-input-notice.js';

function createFakeBanner() {
  return {
    textContent: 'Loading Talking Drum VR…' as string | null,
    hidden: false,
    dataset: { state: 'loading' } as Record<string, string | undefined>,
    remove: vi.fn(),
  };
}

describe('loading banner lifecycle', () => {
  it('removes the banner when startup resolves', async () => {
    const banner = createFakeBanner();
    await expect(trackStartupWithBanner(Promise.resolve(42), banner)).resolves.toBe(42);
    expect(banner.remove).toHaveBeenCalledTimes(1);
  });

  it('shows a plain error message and swallows the rejection when startup fails', async () => {
    const banner = createFakeBanner();
    const logError = vi.fn();
    await expect(
      trackStartupWithBanner(Promise.reject(new Error('boom')), banner, logError),
    ).resolves.toBeUndefined();
    expect(banner.remove).not.toHaveBeenCalled();
    expect(banner.textContent).toBe(LOADING_ERROR_MESSAGE);
    expect(banner.dataset.state).toBe('error');
    expect(banner.hidden).toBe(false);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('tolerates a missing banner element', async () => {
    await expect(trackStartupWithBanner(Promise.resolve('ok'), null)).resolves.toBe('ok');
    await expect(
      trackStartupWithBanner(Promise.reject(new Error('x')), null, () => {}),
    ).resolves.toBeUndefined();
  });
});

describe('controller-only / no-hands XR notice', () => {
  const grace = 3000;

  it('counts hands and hand-less tracked-pointer controllers, ignoring gaze/screen sources', () => {
    const counts = { hands: 0, controllers: 0 };
    countXrInputSourcesInto(
      [
        { hand: {}, targetRayMode: 'tracked-pointer' },
        { targetRayMode: 'tracked-pointer' },
        { targetRayMode: 'tracked-pointer' },
        { targetRayMode: 'gaze' },
        { targetRayMode: 'screen' },
      ],
      counts,
    );
    expect(counts).toEqual({ hands: 1, controllers: 2 });
    expect(countXrInputSourcesInto(undefined, counts)).toEqual({ hands: 0, controllers: 0 });
  });

  it('stays pending during the grace period, then reports controllers-only or no-input', () => {
    const controllers = { hands: 0, controllers: 2 };
    expect(evaluateXrInputNotice(2999, 0, -Infinity, controllers, grace)).toBe('pending');
    expect(evaluateXrInputNotice(3000, 0, -Infinity, controllers, grace)).toBe('controllers-only');
    expect(evaluateXrInputNotice(3000, 0, -Infinity, { hands: 0, controllers: 0 }, grace)).toBe(
      'no-input',
    );
  });

  it('hides as soon as a hand is tracked and restarts the grace window after a dropout', () => {
    expect(evaluateXrInputNotice(10_000, 0, 9_000, { hands: 1, controllers: 0 }, grace)).toBe(
      'hands-present',
    );
    expect(evaluateXrInputNotice(10_000, 0, 9_000, { hands: 0, controllers: 0 }, grace)).toBe(
      'pending',
    );
    expect(evaluateXrInputNotice(12_000, 0, 9_000, { hands: 0, controllers: 2 }, grace)).toBe(
      'controllers-only',
    );
  });

  it('maps states to messages', () => {
    expect(xrInputNoticeMessage('controllers-only')).toBe(CONTROLLERS_ONLY_MESSAGE);
    expect(xrInputNoticeMessage('no-input')).toBe(NO_HANDS_MESSAGE);
    expect(xrInputNoticeMessage('pending')).toBeNull();
    expect(xrInputNoticeMessage('hands-present')).toBeNull();
  });
});

describe('player-rig transform safeguard', () => {
  const drumWorld = new Matrix4().compose(
    new Vector3(0, 1.25, -0.5),
    new Quaternion().setFromEuler(new Euler((30 * Math.PI) / 180, 0, 0)),
    new Vector3(1, 1, 1),
  );
  const inverseDrumWorld = drumWorld.clone().invert();

  it('equals inverse(drumWorld) when the player rig is at identity', () => {
    const playerWorld = new Matrix4();
    const out = composeReferenceSpaceToDrumLocal(new Matrix4(), inverseDrumWorld, playerWorld);
    expect(isIdentityMatrixElements(playerWorld.elements)).toBe(true);
    for (let i = 0; i < 16; i += 1) {
      expect(out.elements[i]).toBeCloseTo(inverseDrumWorld.elements[i], 12);
    }
  });

  it('maps a reference-space point to the same drum-local point as its world position', () => {
    const playerWorld = new Matrix4().compose(
      new Vector3(2, 0, -1),
      new Quaternion().setFromEuler(new Euler(0, Math.PI / 3, 0)),
      new Vector3(1, 1, 1),
    );
    expect(isIdentityMatrixElements(playerWorld.elements)).toBe(false);
    const refPoint = new Vector3(0.05, 1.4, -0.35);
    const worldPoint = refPoint.clone().applyMatrix4(playerWorld);

    const viaSafeguard = refPoint
      .clone()
      .applyMatrix4(composeReferenceSpaceToDrumLocal(new Matrix4(), inverseDrumWorld, playerWorld));
    const viaWorld = worldPoint.clone().applyMatrix4(inverseDrumWorld);
    const unsafe = refPoint.clone().applyMatrix4(inverseDrumWorld);

    expect(viaSafeguard.distanceTo(viaWorld)).toBeLessThan(1e-12);
    expect(unsafe.distanceTo(viaWorld)).toBeGreaterThan(0.5);
  });
});

describe('debug HUD audio probe line', () => {
  it('labels the line as a software + audio buffer estimate and shows n/a for missing values', () => {
    const text = formatAudioProbe({
      contextState: 'running',
      voicesStartedCount: 1,
      activeVoices: 1,
      lastSoftwarePipelineMs: 0.4231,
      maxPipelineMs5s: 0.9,
      maxFrameGapMs5s: 183.25,
      baseLatencyMs: 5.333,
      outputLatencyMs: Number.NaN,
      skipped: { noContext: 2, contextNotRunning: 1, bufferNotReady: 0, invalidVelocity: 0 },
    });
    expect(text.startsWith(AUDIO_PROBE_LABEL)).toBe(true);
    expect(text).toContain('not tracking / end-to-end latency');
    expect(text).toContain('pipeline 0.42 ms');
    expect(text).toContain('base 5.3 ms');
    expect(text).toContain('out n/a');
    expect(text).toContain('audio running');
    expect(text).toContain('max pipeline (5 s) 0.90 ms');
    expect(text).toContain('max frame gap (5 s) 183.3 ms');
    expect(text).toContain('voices started 1');
    expect(text).toContain('active 1');
    expect(text).toContain('skipped no-context 2 / not-running 1 / no-buffer 0 / invalid 0');
    expect(text).not.toMatch(/\| voices \d/);
  });
});
