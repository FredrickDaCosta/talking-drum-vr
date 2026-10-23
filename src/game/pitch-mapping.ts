import { APP_CONFIG, type PitchBand, type PitchConfig } from '../app/config.js';

/**
 * Continuous pitch from squeeze: log (geometric) interpolation lowRatio -> midRatio over squeeze
 * 0..0.5 and midRatio -> highRatio over 0.5..1, so equal squeeze steps give equal musical
 * intervals. Out-of-range or non-finite squeeze is clamped / treated as mid.
 */
export function squeezeToPitchRatio(
  squeeze: number,
  config: PitchConfig = APP_CONFIG.pitch,
): number {
  if (!Number.isFinite(squeeze)) {
    return config.midRatio;
  }
  const s = squeeze <= 0 ? 0 : squeeze >= 1 ? 1 : squeeze;
  if (s <= 0.5) {
    return config.lowRatio * Math.pow(config.midRatio / config.lowRatio, s / 0.5);
  }
  return config.midRatio * Math.pow(config.highRatio / config.midRatio, (s - 0.5) / 0.5);
}

/** Band from squeeze with no history (used for the first sample). */
export function bandWithoutHysteresis(
  squeeze: number,
  config: PitchConfig = APP_CONFIG.pitch,
): PitchBand {
  if (squeeze < config.lowBandMax) {
    return 'L';
  }
  if (squeeze > config.highBandMin) {
    return 'H';
  }
  return 'M';
}

/**
 * Three-band (L/M/H) classifier with hysteresis: to move up across a threshold the squeeze must
 * reach threshold + h/2; to move down it must reach threshold - h/2 (h = bandHysteresis). This stops
 * the band flickering when the hand rests near a boundary.
 */
export class PitchBandClassifier {
  band: PitchBand | null = null;
  private readonly config: PitchConfig;

  constructor(config: PitchConfig = APP_CONFIG.pitch) {
    this.config = config;
  }

  update(squeeze: number): PitchBand {
    const c = this.config;
    if (!Number.isFinite(squeeze)) {
      return this.band ?? 'M';
    }
    if (this.band === null) {
      this.band = bandWithoutHysteresis(squeeze, c);
      return this.band;
    }
    const h = c.bandHysteresis / 2;
    const upToM = c.lowBandMax + h;
    const downToL = c.lowBandMax - h;
    const upToH = c.highBandMin + h;
    const downToM = c.highBandMin - h;
    switch (this.band) {
      case 'L':
        if (squeeze >= upToH) {
          this.band = 'H';
        } else if (squeeze >= upToM) {
          this.band = 'M';
        }
        break;
      case 'M':
        if (squeeze >= upToH) {
          this.band = 'H';
        } else if (squeeze <= downToL) {
          this.band = 'L';
        }
        break;
      case 'H':
        if (squeeze <= downToL) {
          this.band = 'L';
        } else if (squeeze <= downToM) {
          this.band = 'M';
        }
        break;
    }
    return this.band;
  }

  reset(): void {
    this.band = null;
  }
}
