import { APP_CONFIG } from '../app/config.js';

/**
 * Lightweight FPS overlay activated via `?xrfps=1`.
 * Updates at a throttled interval with zero per-frame object allocations.
 */
export class FpsOverlay {
  private element: HTMLDivElement | null = null;
  private frameCount = 0;
  private accumulatedMs = 0;
  private currentFps = 0;

  mount(parent: HTMLElement = document.body): void {
    if (this.element !== null) {
      return;
    }
    const el = document.createElement('div');
    el.id = 'xr-fps-overlay';
    el.dataset.testid = 'fps-overlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'off');
    el.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'z-index:9999',
      'padding:6px 10px',
      'border-radius:6px',
      'background:rgba(14,17,22,0.85)',
      'border:1px solid rgba(255,255,255,0.2)',
      'color:#7ee787',
      'font:600 13px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'pointer-events:none',
      'user-select:none',
    ].join(';');
    el.textContent = 'FPS: --';
    parent.appendChild(el);
    this.element = el;
  }

  update(deltaSeconds: number): void {
    if (this.element === null || deltaSeconds <= 0) {
      return;
    }
    this.frameCount += 1;
    this.accumulatedMs += deltaSeconds * 1000;

    if (this.accumulatedMs >= APP_CONFIG.diagnostics.fpsUpdateIntervalMs) {
      this.currentFps = Math.round((this.frameCount * 1000) / this.accumulatedMs);
      this.element.textContent = `FPS: ${this.currentFps}`;
      this.frameCount = 0;
      this.accumulatedMs = 0;
    }
  }

  dispose(): void {
    if (this.element !== null) {
      this.element.remove();
      this.element = null;
    }
  }
}
