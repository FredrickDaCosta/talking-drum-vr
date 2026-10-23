import { createSystem, type UIKit, UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import { APP_CONFIG } from './app/config.js';
import { getAppFlags } from './app/flags.js';
import { TalkingDrum } from './app/talking-drum-component.js';
import { drumAudio } from './audio/audio-unlock.js';
import {
  countXrInputSourcesInto,
  evaluateXrInputNotice,
  type XrInputCounts,
  type XrInputNoticeState,
  xrInputNoticeMessage,
} from './platform/xr-input-notice.js';
import { requestImmersiveVrSession } from './platform/xr-launch.js';
import { FpsOverlay } from './ui/fps-overlay.js';
import { statusChannel } from './ui/status-channel.js';

declare global {
  interface Window {
    __talkingDrumUi?: { welcomePanelVisible: boolean };
  }
}

export class PanelSystem extends createSystem({
  drums: { required: [TalkingDrum] },
}) {
  private fpsOverlay: FpsOverlay | null = null;
  private headWorldPos = new Vector3();
  private calibratedInSession = false;
  private readonly inputCounts: XrInputCounts = { hands: 0, controllers: 0 };
  private sessionStartMs = 0;
  private lastHandSeenMs = -Infinity;
  private lastInputCheckMs = -Infinity;
  private inputNoticeState: XrInputNoticeState = 'pending';
  private setStatusMessage: (message: string | null) => void = () => {};
  private noticeMessage: string | null = null;
  private renderedMessage: string | null = null;
  private seenChannelVersion = -1;
  /** For tests: whether the welcome panel is shown (it is hidden for the whole XR session). */
  private readonly uiDiag = { welcomePanelVisible: true };

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
    const panelObjects = [panel, this.world.getSceneEntity('welcome-panel')?.object3D];
    if (typeof window !== 'undefined') {
      window.__talkingDrumUi = this.uiDiag;
    }
    // In XR the lesson panel (LessonSystem) is the only panel: the welcome panel would sit behind
    // it, so it is hidden (and its buttons disabled) for the whole session and shown again in 2D.
    const setWelcomePanelShown = (shown: boolean): void => {
      for (const obj of panelObjects) {
        if (obj != null) {
          obj.visible = shown;
        }
      }
      this.uiDiag.welcomePanelVisible = shown;
    };

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

    this.setStatusMessage = updateStatusMessage;

    const launchXR = (): void => {
      // Audio needs a user gesture; a hand strike inside XR is not one, so unlock here.
      drumAudio.unlock();
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
          if (this.renderedMessage !== null) {
            updateStatusMessage(null);
          }
        } else {
          updateStatusMessage(null);
          this.sessionStartMs = performance.now();
          this.lastHandSeenMs = -Infinity;
          this.lastInputCheckMs = -Infinity;
        }
        this.inputNoticeState = 'pending';
        this.noticeMessage = null;
        statusChannel.setInputNotice(null);
        this.renderedMessage = null;
        if (xrButton != null && exitButton != null && this.world.xrEnabled) {
          xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
          // Exit is via the headset's system menu (or the 2D page button); no hidden hit target.
          exitButton.setProperties({ display: 'none' });
        }
        setWelcomePanelShown(is2D);
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
    if (isImmersive) {
      this.updateInputNotice();
      if (statusChannel.version !== this.seenChannelVersion) {
        this.seenChannelVersion = statusChannel.version;
        this.renderStatus();
      }
    }
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

  /** Shows the hands-required notice when no tracked hand appears within the grace period. */
  private updateInputNotice(): void {
    const nowMs = performance.now();
    const { handDetectionGraceMs, recheckIntervalMs } = APP_CONFIG.xrInputNotice;
    if (nowMs - this.lastInputCheckMs < recheckIntervalMs) {
      return;
    }
    this.lastInputCheckMs = nowMs;
    countXrInputSourcesInto(this.world.xrSession?.inputSources, this.inputCounts);
    if (this.inputCounts.hands > 0) {
      this.lastHandSeenMs = nowMs;
    }
    const next = evaluateXrInputNotice(
      nowMs,
      this.sessionStartMs,
      this.lastHandSeenMs,
      this.inputCounts,
      handDetectionGraceMs,
    );
    if (next === this.inputNoticeState) {
      return;
    }
    this.inputNoticeState = next;
    this.noticeMessage = xrInputNoticeMessage(next);
    statusChannel.setInputNotice(this.noticeMessage);
    this.renderStatus();
  }

  /** Shows the calibration prompt if there is one, otherwise the hands-required notice. */
  private renderStatus(): void {
    const message = statusChannel.calibrationPrompt ?? this.noticeMessage;
    if (message !== this.renderedMessage) {
      this.renderedMessage = message;
      this.setStatusMessage(message);
    }
  }
}
