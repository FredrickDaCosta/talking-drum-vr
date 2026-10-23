import type { PitchBand } from '../app/config.js';

export const DESKTOP_INSTRUCTIONS =
  'Click the drum to strike. Choose Low, Mid or High to change the pitch.';
export const DESKTOP_KEY_HINT = 'Keys: 1 2 3 (or Q W E) pitch · Space strike · Shift = soft';
export const PLAY_WITHOUT_HEADSET = 'Play without a headset';

const BAND_LABELS: readonly { band: PitchBand; label: string }[] = [
  { band: 'L', label: 'Low' },
  { band: 'M', label: 'Mid' },
  { band: 'H', label: 'High' },
];

export interface DesktopOverlay {
  readonly root: HTMLElement;
  readonly offerButton: HTMLButtonElement;
  showControls(shown: boolean): void;
  showOffer(shown: boolean): void;
  setBand(band: PitchBand): void;
  dispose(): void;
}

/**
 * Minimal accessible HTML overlay for desktop play: the instructions, three pitch buttons
 * (aria-pressed, >= 44 px tap targets, styled in index.html) and a keyboard hint. Also the small
 * secondary "Play without a headset" button shown under Enter VR on VR-capable browsers.
 * Plain DOM, no third-party requests.
 */
export function createDesktopOverlay(
  host: HTMLElement,
  onBand: (band: PitchBand) => void,
  onPlayWithoutHeadset: () => void,
): DesktopOverlay {
  const root = document.createElement('section');
  root.id = 'desktop-controls';
  root.dataset.testid = 'desktop-controls';
  root.setAttribute('aria-label', 'Desktop controls');
  root.hidden = true;

  const instructions = document.createElement('p');
  instructions.className = 'desktop-instructions';
  instructions.textContent = DESKTOP_INSTRUCTIONS;

  const group = document.createElement('div');
  group.className = 'desktop-pitch';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Pitch');
  const buttons = new Map<PitchBand, HTMLButtonElement>();
  for (const { band, label } of BAND_LABELS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.band = band;
    button.dataset.testid = `pitch-${label.toLowerCase()}`;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => onBand(band));
    buttons.set(band, button);
    group.append(button);
  }

  const hint = document.createElement('p');
  hint.className = 'desktop-hint';
  hint.dataset.testid = 'desktop-key-hint';
  hint.textContent = DESKTOP_KEY_HINT;

  root.append(instructions, group, hint);
  host.prepend(root);

  const offerButton = document.createElement('button');
  offerButton.type = 'button';
  offerButton.id = 'play-without-headset';
  offerButton.dataset.testid = 'play-without-headset';
  offerButton.textContent = PLAY_WITHOUT_HEADSET;
  offerButton.hidden = true;
  offerButton.addEventListener('click', onPlayWithoutHeadset);
  host.append(offerButton);

  return {
    root,
    offerButton,
    showControls: (shown) => {
      root.hidden = !shown;
    },
    showOffer: (shown) => {
      offerButton.hidden = !shown;
    },
    setBand: (band) => {
      for (const [b, button] of buttons) {
        button.setAttribute('aria-pressed', b === band ? 'true' : 'false');
      }
    },
    dispose: () => {
      root.remove();
      offerButton.remove();
    },
  };
}
