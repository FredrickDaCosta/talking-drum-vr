/**
 * Debug HUD stub activated via `?debug=1`.
 * In Phase 1+ this will display hand-joint tracking state, skin-plane distance, and tone pitch.
 */
export class DebugHud {
  private element: HTMLDivElement | null = null;

  mount(parent: HTMLElement = document.body): void {
    if (this.element !== null) {
      return;
    }
    const el = document.createElement('div');
    el.id = 'xr-debug-hud';
    el.dataset.testid = 'debug-hud';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Debug HUD');
    el.style.cssText = [
      'position:fixed',
      'bottom:12px',
      'right:12px',
      'z-index:9999',
      'padding:8px 12px',
      'border-radius:6px',
      'background:rgba(14,17,22,0.85)',
      'border:1px solid rgba(88,166,255,0.35)',
      'color:#c9d1d9',
      'font:500 12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'pointer-events:none',
      'user-select:none',
    ].join(';');
    el.textContent = 'DEBUG HUD (M0 stub) | mode: seated-hands | drum: 0.50m ahead, -0.35m eye';
    parent.appendChild(el);
    this.element = el;
  }

  setStatus(statusText: string): void {
    if (this.element !== null) {
      this.element.textContent = statusText;
    }
  }

  dispose(): void {
    if (this.element !== null) {
      this.element.remove();
      this.element = null;
    }
  }
}
