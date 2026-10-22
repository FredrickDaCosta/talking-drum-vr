/**
 * Runtime URL query flag parser for diagnostics and developer overlays.
 * Supports:
 * - ?xrfps=1 : enables the real-time frame-rate overlay
 * - ?debug=1 : enables the debug HUD
 * - ?hand=left|right : overrides the primary striking hand
 */

import type { Handedness } from './config.js';

export interface AppFlags {
  readonly xrfps: boolean;
  readonly debug: boolean;
  readonly hand?: Handedness;
}

function isEnabledFlag(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
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

export function parseAppFlags(search: string): AppFlags {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const hand = parseHandFlag(params.get('hand'));
  return {
    xrfps: isEnabledFlag(params.get('xrfps')),
    debug: isEnabledFlag(params.get('debug')),
    ...(hand !== undefined ? { hand } : {}),
  };
}

export function getAppFlags(): AppFlags {
  if (typeof window === 'undefined' || !window.location) {
    return { xrfps: false, debug: false };
  }
  return parseAppFlags(window.location.search);
}
