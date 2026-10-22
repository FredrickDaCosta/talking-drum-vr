import { createSystem, type UIKit, UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import { APP_CONFIG } from './app/config.js';
import { getAppFlags } from './app/flags.js';
import { TalkingDrum } from './app/talking-drum-component.js';
import { requestImmersiveVrSession } from './platform/xr-launch.js';
import { FpsOverlay } from './ui/fps-overlay.js';

export class PanelSystem extends createSystem({
  drums: { required: [TalkingDrum] },
}) {
  private fpsOverlay: FpsOverlay | null = null;
  private headWorldPos = new Vector3();
  private calibratedInSession = false;

  init(): void {
    const flags = getAppFlags();
    if (flags.xrfps) {
      this.fpsOverlay = new FpsOverlay();
      this.fpsOverlay.mount();
      this.cleanupFuncs.push(() => this.fpsOverlay?.dispose());
    }

    const domEnterBtn = document.getElementById('enter-vr-button') as HTMLButtonElement | null;
    const domStatusEl = document.getElementById('vr-status-message') as HTMLDivElement | null;
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    const xrButton = panel?.getElementById('xr-button');
    const exitButton = panel?.getElementById('exit-button');
    const panelStatusEl = panel?.getElementById<UIKit.Text>('vr-status');

    const updateStatusMessage = (message: string | null): void => {
      const hasMessage = message != null && message.length > 0;
      if (domStatusEl !== null) {
        domStatusEl.textContent = hasMessage ? message : '';
        domStatusEl.hidden = !hasMessage;
      }
      if (panelStatusEl != null) {
        panelStatusEl.setProperties({
          text: hasMessage ? message : '',
          display: hasMessage ? 'flex' : 'none',
        });
      }
    };

    const launchXR = (): void => {
      void requestImmersiveVrSession({
        world: this.world,
        onStatusMessage: updateStatusMessage,
      });
    };

    const exitXR = (): void => {
      this.world.exitXR();
    };

    const launchOrExitDomXR = (): void => {
      if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
        launchXR();
      } else {
        exitXR();
      }
    };

    if (domEnterBtn !== null) {
      domEnterBtn.addEventListener('click', launchOrExitDomXR);
      this.cleanupFuncs.push(() => domEnterBtn.removeEventListener('click', launchOrExitDomXR));
    }

    if (xrButton != null && exitButton != null) {
      if (!this.world.xrEnabled) {
        xrButton.setProperties({ display: 'none' });
        exitButton.setProperties({ display: 'none' });
      } else {
        xrButton.addEventListener('click', launchXR);
        exitButton.addEventListener('click', exitXR);
        this.cleanupFuncs.push(
          () => xrButton.removeEventListener('click', launchXR),
          () => exitButton.removeEventListener('click', exitXR),
        );
      }
    }

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        if (is2D) {
          this.calibratedInSession = false;
        } else {
          updateStatusMessage(null);
        }
        if (xrButton != null && exitButton != null && this.world.xrEnabled) {
          xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
          exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
        }
        if (domEnterBtn !== null) {
          domEnterBtn.textContent = is2D ? 'Enter VR' : 'Exit VR';
          domEnterBtn.setAttribute('aria-label', is2D ? 'Enter VR (Hand Tracking)' : 'Exit VR');
        }
      }),
    );
  }

  update(delta: number): void {
    this.fpsOverlay?.update(delta);

    const isImmersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (isImmersive && !this.calibratedInSession) {
      this.player.head.updateWorldMatrix(true, false);
      this.headWorldPos.setFromMatrixPosition(this.player.head.matrixWorld);
      if (this.headWorldPos.y > 0.3) {
        const { distanceAheadMeters, belowEyeLevelMeters } = APP_CONFIG.drumPlacement;
        for (const entity of this.queries.drums.entities) {
          const obj = entity.object3D;
          if (obj != null) {
            obj.position.set(
              this.headWorldPos.x,
              this.headWorldPos.y - belowEyeLevelMeters,
              this.headWorldPos.z - distanceAheadMeters,
            );
          }
        }
        this.calibratedInSession = true;
      }
    }
  }
}
