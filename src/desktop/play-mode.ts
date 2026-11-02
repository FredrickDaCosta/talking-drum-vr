/** Where the lesson is played: in a WebXR headset, or on a flat screen with mouse / keyboard / touch. */
export type PlayMode = 'vr' | 'desktop';

export interface PlayModeDecision {
  /** Mode to start in. */
  readonly mode: PlayMode;
  /** Whether WebXR immersive-vr is available (Enter VR stays first and prominent when it is). */
  readonly xrSupported: boolean;
  /** Show the small secondary "Play without a headset" option (VR-capable browsers only). */
  readonly offerDesktop: boolean;
}

/**
 * VR stays the primary mode: a VR-capable browser starts in VR mode and only offers desktop play as
 * a secondary option. Without immersive-vr (or with ?mode=desktop) the page starts in desktop mode,
 * so the link is never a dead end.
 */
export function decidePlayMode(xrSupported: boolean, forceDesktop: boolean): PlayModeDecision {
  if (forceDesktop || !xrSupported) {
    return { mode: 'desktop', xrSupported, offerDesktop: false };
  }
  return { mode: 'vr', xrSupported, offerDesktop: true };
}

/** `navigator.xr.isSessionSupported('immersive-vr')`, false when WebXR is missing or the check fails. */
export async function detectImmersiveVr(
  xr: XRSystem | null | undefined = typeof navigator !== 'undefined' ? navigator.xr : undefined,
): Promise<boolean> {
  if (xr == null || typeof xr.isSessionSupported !== 'function') {
    return false;
  }
  try {
    return await xr.isSessionSupported('immersive-vr');
  } catch {
    return false;
  }
}
