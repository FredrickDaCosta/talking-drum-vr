/**
 * Small shared UI flags between systems. `desktopActive` is set by DesktopModeSystem while desktop
 * play is on (2D only); PanelSystem hides the welcome panel then, as the lesson panel's title screen
 * carries the instructions.
 */
export const uiState = {
  desktopActive: false,
  version: 0,
  setDesktopActive(active: boolean): void {
    if (active !== this.desktopActive) {
      this.desktopActive = active;
      this.version += 1;
    }
  },
};
