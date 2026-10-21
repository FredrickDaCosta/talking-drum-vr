/**
 * Runtime URL query flag parser for diagnostics and developer overlays.
 * Supports:
 * - ?xrfps=1 : enables the real-time frame-rate overlay
 * - ?debug=1 : enables the debug HUD stub
 */

export interface AppFlags {
  readonly xrfps: boolean;
  readonly debug: boolean;
}

function isEnabledFlag(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export function parseAppFlags(search: string): AppFlags {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return {
    xrfps: isEnabledFlag(params.get('xrfps')),
    debug: isEnabledFlag(params.get('debug')),
  };
}

export function getAppFlags(): AppFlags {
  if (typeof window === 'undefined' || !window.location) {
    return { xrfps: false, debug: false };
  }
  return parseAppFlags(window.location.search);
}
