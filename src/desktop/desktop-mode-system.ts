import { createSystem, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { APP_CONFIG, type PitchBand } from '../app/config.js';
import { getAppFlags } from '../app/flags.js';
import { TalkingDrum } from '../app/talking-drum-component.js';
import { drumAudio } from '../audio/audio-unlock.js';
import { StrikeSystem } from '../game/strike-system.js';
import { uiState } from '../ui/ui-state.js';
import { BAND_KEYS, DesktopInput } from './desktop-input.js';
import { createDesktopOverlay, type DesktopOverlay } from './desktop-overlay.js';
import { DrumHeadOutline } from './drum-head-hit.js';
import { decidePlayMode, detectImmersiveVr, type PlayMode } from './play-mode.js';

/** Debug / test view of desktop mode (window.__talkingDrumDesktop). */
export interface DesktopDiagnostics {
  mode: PlayMode | 'detecting';
  xrSupported: boolean;
  /** Desktop input is live (desktop mode and not in an XR session). */
  active: boolean;
  band: PitchBand;
  strikes: number;
  /** Clicks / taps on the canvas that missed the drum head. */
  misses: number;
  /** CSS-pixel position of the drum head centre in the page (tests click it). */
  headScreen: { x: number; y: number };
}

declare global {
  interface Window {
    __talkingDrumDesktop?: DesktopDiagnostics;
  }
}

/**
 * Desktop play mode: visitors without a headset play the same lesson with mouse, keyboard or
 * touch. Strikes go through `StrikeSystem.emitExternalStrike` (the same listeners as hand strikes:
 * audio and lesson), and the pitch band goes through `DesktopInput` into the shared pitch-hand
 * state (latched at the strike as in VR). Nothing here runs during an XR session, so the VR path is
 * unchanged; leaving XR returns to desktop play if it was active.
 */
export class DesktopModeSystem extends createSystem({
  drums: { required: [TalkingDrum] },
}) {
  private readonly desktopInput = new DesktopInput();
  private readonly outline = new DrumHeadOutline(APP_CONFIG.desktop.headOutlinePoints);
  private readonly headCentre = new Vector3();
  private readonly headNormal = new Vector3();
  private readonly drumQuat = new Quaternion();
  private readonly scratch = new Vector3();
  private overlay: DesktopOverlay | null = null;
  private mode: PlayMode | 'detecting' = 'detecting';
  private pendingStrike = false;
  /** The camera's own vertical FOV, restored whenever desktop play is off (e.g. in XR). */
  private baseFov = Number.NaN;
  private fittedAspect = Number.NaN;

  private readonly diag: DesktopDiagnostics = {
    mode: 'detecting',
    xrSupported: false,
    active: false,
    band: APP_CONFIG.desktop.initialBand,
    strikes: 0,
    misses: 0,
    headScreen: { x: Number.NaN, y: Number.NaN },
  };

  init(): void {
    if (typeof document === 'undefined') {
      return;
    }
    window.__talkingDrumDesktop = this.diag;
    const host = document.getElementById('xr-hud-controls') ?? document.body;
    this.overlay = createDesktopOverlay(
      host,
      (band) => this.selectBand(band),
      () => this.setMode('desktop'),
    );

    const canvas = this.world.renderer.domElement;
    const onPointerDown = (event: PointerEvent): void => {
      if (!this.diag.active || !event.isPrimary || event.button > 0) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      if (this.hitsDrumHead(ndcX, ndcY)) {
        this.strike(event.shiftKey);
      } else {
        this.diag.misses += 1;
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!this.diag.active || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const band = BAND_KEYS[event.code];
      if (band !== undefined) {
        this.selectBand(band);
        return;
      }
      const onButton = event.target instanceof HTMLButtonElement;
      if ((event.code === 'Space' || event.code === 'Enter') && !onButton) {
        event.preventDefault();
        this.strike(event.shiftKey);
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    const unsubscribe = this.world.visibilityState.subscribe(() => this.applyActive());
    this.cleanupFuncs.push(unsubscribe, () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      this.overlay?.dispose();
      uiState.setDesktopActive(false);
    });

    const flags = getAppFlags();
    void detectImmersiveVr().then((xrSupported) => {
      const decision = decidePlayMode(xrSupported, flags.mode === 'desktop');
      this.diag.xrSupported = xrSupported;
      this.overlay?.showOffer(decision.offerDesktop);
      this.setMode(decision.mode);
    });
  }

  update(): void {
    if (!this.diag.active) {
      return;
    }
    this.fitPortrait();
    // Keep the head-centre screen position current for tests (no allocation).
    if (this.updateHeadGeometry()) {
      const camera = this.world.camera;
      const canvas = this.world.renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      this.scratch.copy(this.headCentre).project(camera);
      this.diag.headScreen.x = rect.left + ((this.scratch.x + 1) / 2) * rect.width;
      this.diag.headScreen.y = rect.top + ((1 - this.scratch.y) / 2) * rect.height;
    }
  }

  /**
   * Phones in portrait have a narrow horizontal view, which crops the drum, ladder and panel. In
   * desktop play only (never during XR, whose projection comes from the headset), widen the
   * vertical FOV so the horizontal FOV stays at least what the default camera shows at 16:9.
   * IWSDK keeps the canvas size and aspect in step with the window, so no resize logic is needed.
   */
  private fitPortrait(): void {
    const camera = this.world.camera;
    if (Number.isNaN(this.baseFov)) {
      this.baseFov = camera.fov;
    }
    if (camera.aspect === this.fittedAspect) {
      return;
    }
    this.fittedAspect = camera.aspect;
    const minHalfH = Math.atan(Math.tan((this.baseFov * Math.PI) / 360) * (16 / 9));
    const needed = (2 * Math.atan(Math.tan(minHalfH) / camera.aspect) * 180) / Math.PI;
    camera.fov = Math.min(100, Math.max(this.baseFov, needed));
    camera.updateProjectionMatrix();
  }

  private restoreFov(): void {
    if (!Number.isNaN(this.baseFov) && this.world.camera.fov !== this.baseFov) {
      this.world.camera.fov = this.baseFov;
      this.world.camera.updateProjectionMatrix();
    }
    this.fittedAspect = Number.NaN;
  }

  private setMode(mode: PlayMode): void {
    this.mode = mode;
    this.diag.mode = mode;
    if (mode === 'desktop') {
      this.overlay?.showOffer(false);
    }
    this.applyActive();
  }

  /** Desktop input is live only in desktop mode and outside an XR session. */
  private applyActive(): void {
    const in2D = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    const active = this.mode === 'desktop' && in2D;
    if (active && !this.diag.active) {
      this.desktopInput.activate();
      this.diag.band = this.desktopInput.band;
      this.overlay?.setBand(this.desktopInput.band);
    }
    if (!active) {
      this.restoreFov();
    }
    this.diag.active = active;
    this.overlay?.showControls(active);
    document.body.classList.toggle('desktop-mode', this.mode === 'desktop');
    uiState.setDesktopActive(active);
  }

  private selectBand(band: PitchBand): void {
    if (!this.diag.active) {
      return;
    }
    this.desktopInput.setBand(band);
    this.diag.band = band;
    this.overlay?.setBand(band);
  }

  /**
   * Emits one strike. The first gesture also unlocks audio (audio-unlock.ts listens in the capture
   * phase); if the context is still resuming, the strike waits for it so it is heard. The band is
   * latched when the strike is delivered, exactly as for a hand strike.
   */
  private strike(soft: boolean): void {
    if (this.pendingStrike) {
      return;
    }
    const deliver = (): void => {
      this.pendingStrike = false;
      if (!this.diag.active) {
        return;
      }
      const now = performance.now();
      StrikeSystem.emitExternalStrike(this.desktopInput.makeStrike(now, soft));
      this.diag.strikes += 1;
    };
    if (drumAudio.context?.state === 'running') {
      deliver();
      return;
    }
    drumAudio.unlock();
    this.pendingStrike = true;
    void drumAudio.whenRunning().then(deliver);
  }

  private hitsDrumHead(ndcX: number, ndcY: number): boolean {
    if (!this.updateHeadGeometry()) {
      return false;
    }
    this.outline.project(
      this.world.camera,
      this.headCentre,
      this.headNormal,
      APP_CONFIG.drumGeometry.headRadiusMeters,
    );
    return this.outline.contains(ndcX, ndcY);
  }

  /** World centre and normal of the drum's top head (drum-local +Y end). */
  private updateHeadGeometry(): boolean {
    for (const entity of this.queries.drums.entities) {
      const obj = entity.object3D;
      if (obj == null) {
        continue;
      }
      obj.updateWorldMatrix(true, false);
      this.drumQuat.setFromRotationMatrix(obj.matrixWorld);
      this.headNormal.set(0, 1, 0).applyQuaternion(this.drumQuat);
      this.headCentre
        .setFromMatrixPosition(obj.matrixWorld)
        .addScaledVector(this.headNormal, APP_CONFIG.drumGeometry.lengthMeters / 2);
      return true;
    }
    return false;
  }
}
