/**
 * Messages other systems want shown: the DOM status line (PanelSystem) and, in XR, the lesson panel
 * (LessonSystem; the welcome panel is hidden in XR). A calibration prompt takes priority over the
 * hands-required notice.
 */
export const statusChannel = {
  calibrationPrompt: null as string | null,
  /** Hands-required / controller notice from PanelSystem (shown on the lesson title screen). */
  inputNotice: null as string | null,
  version: 0,
  setInputNotice(message: string | null): void {
    if (message !== this.inputNotice) {
      this.inputNotice = message;
      this.version += 1;
    }
  },
  setCalibrationPrompt(message: string | null): void {
    if (message !== this.calibrationPrompt) {
      this.calibrationPrompt = message;
      this.version += 1;
    }
  },
};
