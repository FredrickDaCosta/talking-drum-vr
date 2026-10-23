import { PerspectiveCamera, Vector3 } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../src/app/config.js';
import { parseAppFlags } from '../../src/app/flags.js';
import { BAND_KEYS, DesktopInput } from '../../src/desktop/desktop-input.js';
import { DrumHeadOutline, pointInPolygon } from '../../src/desktop/drum-head-hit.js';
import { decidePlayMode, detectImmersiveVr } from '../../src/desktop/play-mode.js';
import { latchPitchForStrike, type PitchHandState } from '../../src/input/left-hand-pitch.js';

function freshPitchState(): PitchHandState {
  return {
    hand: 'left',
    tracking: 'LOST',
    rawCurl: 0.9,
    squeeze: 0.5,
    band: 'M',
    pitchRatio: 1,
    calibration: 'not-started',
    calibrationOpenCurl: Number.NaN,
    calibrationFistCurl: Number.NaN,
    calibrationFailureReason: '',
    latchedSqueeze: Number.NaN,
    latchedBand: 'none',
    latchedPitchRatio: Number.NaN,
    latchedTracking: 'none',
    strikesLatched: 0,
  };
}

describe('play mode', () => {
  it('keeps VR primary where immersive-vr works and offers desktop as secondary', () => {
    expect(decidePlayMode(true, false)).toEqual({
      mode: 'vr',
      xrSupported: true,
      offerDesktop: true,
    });
  });

  it('starts in desktop mode without immersive-vr, or with ?mode=desktop', () => {
    expect(decidePlayMode(false, false)).toEqual({
      mode: 'desktop',
      xrSupported: false,
      offerDesktop: false,
    });
    expect(decidePlayMode(true, true).mode).toBe('desktop');
    expect(parseAppFlags('?mode=desktop').mode).toBe('desktop');
    expect(parseAppFlags('?mode=DESKTOP').mode).toBe('desktop');
    expect(parseAppFlags('?mode=vr').mode).toBeUndefined();
  });

  it('detects immersive-vr support safely', async () => {
    expect(await detectImmersiveVr(null)).toBe(false);
    const xr = (supported: boolean | Error) =>
      ({
        isSessionSupported: () =>
          supported instanceof Error ? Promise.reject(supported) : Promise.resolve(supported),
      }) as unknown as XRSystem;
    expect(await detectImmersiveVr(xr(true))).toBe(true);
    expect(await detectImmersiveVr(xr(false))).toBe(false);
    expect(await detectImmersiveVr(xr(new Error('blocked')))).toBe(false);
  });
});

describe('DesktopInput adapter', () => {
  it('drives the shared pitch-hand state from a chosen band (ladder centre, demo ratio)', () => {
    const state = freshPitchState();
    const input = new DesktopInput(APP_CONFIG, state);
    input.activate();
    expect(state.calibration).toBe('skipped');
    expect(state).toMatchObject({ band: 'M', pitchRatio: 1, tracking: 'TRACKED' });
    input.setBand('H');
    expect(state.band).toBe('H');
    expect(state.pitchRatio).toBe(APP_CONFIG.lesson.bandRatios.H);
    expect(state.squeeze).toBeGreaterThan(APP_CONFIG.pitch.highBandMin);
    input.setBand('L');
    expect(state.squeeze).toBeLessThan(APP_CONFIG.pitch.lowBandMax);
    expect(state.pitchRatio).toBe(0.75);
  });

  it('keeps a finished calibration (e.g. after a VR session) instead of marking it skipped', () => {
    const state = { ...freshPitchState(), calibration: 'done' as const };
    new DesktopInput(APP_CONFIG, state).activate();
    expect(state.calibration).toBe('done');
  });

  it('latches the band chosen before the strike, as in VR', () => {
    const state = freshPitchState();
    const input = new DesktopInput(APP_CONFIG, state);
    input.activate();
    input.setBand('H');
    const ratio = latchPitchForStrike(state); // what DrumAudioSystem does on the strike
    input.setBand('L'); // changing the band afterwards does not change the latched strike
    expect(ratio).toBe(1.33);
    expect(state).toMatchObject({ latchedBand: 'H', latchedPitchRatio: 1.33, strikesLatched: 1 });
  });

  it('makes normal and soft (Shift) strikes at the configured velocities on the head centre', () => {
    const input = new DesktopInput(APP_CONFIG, freshPitchState());
    const normal = input.makeStrike(1000, false);
    const soft = input.makeStrike(1000, true);
    expect(normal.hit.speed).toBe(APP_CONFIG.desktop.strikeVelocityMps);
    expect(soft.hit.speed).toBe(APP_CONFIG.desktop.softStrikeVelocityMps);
    expect(soft.hit.speed).toBeLessThan(normal.hit.speed);
    expect(normal).toMatchObject({
      hand: 'right',
      frameTimestampMs: 1000,
      hit: { time: 1000, position: { x: 0, y: APP_CONFIG.drumGeometry.lengthMeters / 2, z: 0 } },
    });
    // Within the audio gain mapping range (soft is quieter but audible).
    expect(soft.hit.speed).toBeGreaterThanOrEqual(APP_CONFIG.audio.minStrikeSpeedMps);
  });

  it('maps 1 2 3 and Q W E to Low, Mid, High', () => {
    expect([BAND_KEYS.Digit1, BAND_KEYS.Digit2, BAND_KEYS.Digit3]).toEqual(['L', 'M', 'H']);
    expect([BAND_KEYS.KeyQ, BAND_KEYS.KeyW, BAND_KEYS.KeyE]).toEqual(['L', 'M', 'H']);
  });
});

describe('drum head click test', () => {
  it('point-in-polygon', () => {
    const xs = new Float64Array([-1, 1, 1, -1]);
    const ys = new Float64Array([-1, -1, 1, 1]);
    expect(pointInPolygon(0, 0, xs, ys, 4)).toBe(true);
    expect(pointInPolygon(1.5, 0, xs, ys, 4)).toBe(false);
  });

  it('accepts the head centre and rejects points beside the drum, from the default camera', () => {
    const camera = new PerspectiveCamera(50, 16 / 9, 0.01, 100);
    camera.position.set(0, 1.6, 0.45);
    camera.lookAt(0, 1.35, -0.5);
    camera.updateMatrixWorld(true);
    const tilt = (APP_CONFIG.drumPlacement.drumTiltDeg * Math.PI) / 180;
    const normal = new Vector3(0, Math.cos(tilt), Math.sin(tilt));
    const centre = new Vector3(0, 1.25, -0.5).addScaledVector(normal, 0.19);
    const outline = new DrumHeadOutline(24);
    outline.project(camera, centre, normal, APP_CONFIG.drumGeometry.headRadiusMeters);
    const c = centre.clone().project(camera);
    expect(outline.contains(c.x, c.y)).toBe(true);
    const beside = centre
      .clone()
      .add(new Vector3(0.2, 0, 0))
      .project(camera);
    expect(outline.contains(beside.x, beside.y)).toBe(false);
    const nearRim = centre
      .clone()
      .add(new Vector3(0.1, 0, 0))
      .project(camera);
    expect(outline.contains(nearRim.x, nearRim.y)).toBe(true);
  });
});
