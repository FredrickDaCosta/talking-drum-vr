import { DrumAudio } from './drum-audio.js';

/** The app's single DrumAudio instance (one AudioContext for the whole page). */
export const drumAudio = new DrumAudio();

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'click'] as const;

/**
 * Resumes audio on the first page-level user gesture. PanelSystem also calls
 * `drumAudio.unlock()` directly in the Enter VR click handler, so entering VR always unlocks.
 * Listeners remove themselves once the context reports 'running'.
 */
export function installAudioUnlockListeners(
  target: EventTarget,
  audio: DrumAudio = drumAudio,
): () => void {
  const onGesture = (): void => {
    audio.unlock();
    if (
      audio.diagnostics.contextState === 'running' ||
      audio.diagnostics.contextState === 'unsupported'
    ) {
      remove();
    }
  };
  const remove = (): void => {
    for (const type of UNLOCK_EVENTS) {
      target.removeEventListener(type, onGesture, true);
    }
  };
  for (const type of UNLOCK_EVENTS) {
    target.addEventListener(type, onGesture, true);
  }
  return remove;
}
