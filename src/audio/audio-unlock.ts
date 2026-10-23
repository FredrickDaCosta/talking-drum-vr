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

/**
 * Asks the context to resume when the tab becomes visible again (the browser or OS may have
 * suspended it). `requestResume()` only acts after a user gesture and never plays a late sound.
 */
export function installAudioResumeOnVisible(
  doc: Document,
  audio: DrumAudio = drumAudio,
): () => void {
  const onVisibility = (): void => {
    if (doc.visibilityState === 'visible') {
      audio.requestResume('visibility');
    }
  };
  doc.addEventListener('visibilitychange', onVisibility);
  return () => doc.removeEventListener('visibilitychange', onVisibility);
}
