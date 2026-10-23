/**
 * Runtime URL query flag parser for diagnostics and developer overlays.
 * Supports:
 * - ?xrfps=1 : enables the real-time frame-rate overlay
 * - ?debug=1 : enables the debug HUD
 * - ?hand=left|right : overrides the primary striking hand
 * - ?calib=0 : skips the squeeze-hand calibration (default open/fist values are used)
 * - ?lesson=<id> : starts the lesson session at that phrase id (from src/content/lessons.ts)
 */

import type { Handedness } from './config.js';

export interface AppFlags {
  readonly xrfps: boolean;
  readonly debug: boolean;
  readonly hand?: Handedness;
  /** Present (false) only when ?calib=0 asks to skip squeeze calibration. */
  readonly calib?: false;
  /** Lesson phrase id to start at (lower-case letters, digits and hyphens only). */
  readonly lesson?: string;
}

function isEnabledFlag(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function isDisabledFlag(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '0' || normalized === 'false';
}

function parseHandFlag(value: string | null): Handedness | undefined {
  if (value === null) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'left' || normalized === 'right') {
    return normalized;
  }
  return undefined;
}

function parseLessonFlag(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(normalized) ? normalized : undefined;
}

export function parseAppFlags(search: string): AppFlags {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const hand = parseHandFlag(params.get('hand'));
  const lesson = parseLessonFlag(params.get('lesson'));
  return {
    xrfps: isEnabledFlag(params.get('xrfps')),
    debug: isEnabledFlag(params.get('debug')),
    ...(hand !== undefined ? { hand } : {}),
    ...(isDisabledFlag(params.get('calib')) ? { calib: false as const } : {}),
    ...(lesson !== undefined ? { lesson } : {}),
  };
}

export function getAppFlags(): AppFlags {
  if (typeof window === 'undefined' || !window.location) {
    return { xrfps: false, debug: false };
  }
  return parseAppFlags(window.location.search);
}
