/**
 * Messages other systems want shown in the status line (DOM status and the in-world welcome-panel
 * text). PanelSystem renders them; a calibration prompt takes priority over the hands-required notice.
 */
export const statusChannel = {
  calibrationPrompt: null as string | null,
  version: 0,
  setCalibrationPrompt(message: string | null): void {
    if (message !== this.calibrationPrompt) {
      this.calibrationPrompt = message;
      this.version += 1;
    }
  },
};
