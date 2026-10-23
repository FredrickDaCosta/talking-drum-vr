import { APP_CONFIG, type AppConfig, type PitchBand } from '../app/config.js';
import { bandCentreSqueezes } from '../game/pitch-ladder-layout.js';
import type { InternalStrikeEvent } from '../game/strike-detector.js';
import { type PitchHandState, pitchHand } from '../input/left-hand-pitch.js';

const BANDS: readonly PitchBand[] = ['L', 'M', 'H'];

/** Keyboard codes for the three pitch bands: 1 / 2 / 3 and Q / W / E. */
export const BAND_KEYS: Readonly<Record<string, PitchBand>> = {
  Digit1: 'L',
  Digit2: 'M',
  Digit3: 'H',
  Numpad1: 'L',
  Numpad2: 'M',
  Numpad3: 'H',
  KeyQ: 'L',
  KeyW: 'M',
  KeyE: 'H',
};

/**
 * Desktop input adapter: stands in for the left hand (pitch band) and the right hand (strikes)
 * without faking any XR joints. It writes the selected band into the shared pitch-hand state, so
 * the pitch ladder shows it and DrumAudioSystem latches it on the strike exactly as in VR; and it
 * builds the same `InternalStrikeEvent` the StrikeSystem emits for a hand strike.
 */
export class DesktopInput {
  private currentBand: PitchBand;
  private readonly centres: [number, number, number];

  constructor(
    private readonly config: AppConfig = APP_CONFIG,
    private readonly state: PitchHandState = pitchHand,
  ) {
    this.centres = bandCentreSqueezes(config.pitch);
    this.currentBand = config.desktop.initialBand;
  }

  get band(): PitchBand {
    return this.currentBand;
  }

  /** Takes over the pitch-hand state for desktop play (no hand to calibrate). */
  activate(): void {
    if (this.state.calibration !== 'done') {
      this.state.calibration = 'skipped';
    }
    this.setBand(this.currentBand);
  }

  /** Selects a band: the ladder marker moves to its centre and its demo pitch ratio is used. */
  setBand(band: PitchBand): void {
    this.currentBand = band;
    const s = this.state;
    s.band = band;
    s.squeeze = this.centres[BANDS.indexOf(band)];
    s.pitchRatio = this.config.lesson.bandRatios[band];
    s.tracking = 'TRACKED';
    s.rawCurl = Number.NaN;
  }

  strikeVelocity(soft: boolean): number {
    return soft ? this.config.desktop.softStrikeVelocityMps : this.config.desktop.strikeVelocityMps;
  }

  /** The strike event for a click / tap / Space at the centre of the drum head. */
  makeStrike(nowMs: number, soft: boolean): InternalStrikeEvent {
    return {
      hit: {
        time: nowMs,
        speed: this.strikeVelocity(soft),
        position: { x: 0, y: this.config.drumGeometry.lengthMeters / 2, z: 0 },
      },
      hand: 'right',
      frameTimestampMs: nowMs,
      frameEntryPerfNowMs: nowMs,
    };
  }
}
