export const VR_UNAVAILABLE_MESSAGE =
  "VR isn't available in this browser. Open this page in Meta Quest Browser, or on a desktop use the Immersive Web Emulator extension.";

export const VR_SESSION_ERROR_MESSAGE =
  'Could not start VR session. Check your headset or emulator and try Enter VR again.';

export interface XRLaunchableWorld {
  launchXR: () => void;
  session?: unknown;
  sessionRequestPending?: boolean;
}

export interface RequestImmersiveVrOptions {
  world: XRLaunchableWorld;
  onStatusMessage: (message: string | null) => void;
  xrSystem?: XRSystem | null;
  warn?: (message: string, error: unknown) => void;
}

/**
 * Checks `navigator.xr` and `await navigator.xr.isSessionSupported('immersive-vr')`
 * on each invocation before requesting a WebXR session.
 *
 * - If unsupported, does not call `requestSession` or `world.launchXR()`, logs no
 *   console errors, and reports `VR_UNAVAILABLE_MESSAGE`.
 * - If supported, delegates to `world.launchXR()` while intercepting any
 *   `requestSession` rejection so failures log via `console.warn` (never
 *   `console.error`), surface a retry hint, and leave the app usable.
 */
export async function requestImmersiveVrSession({
  world,
  onStatusMessage,
  xrSystem = typeof navigator !== 'undefined' ? (navigator.xr ?? null) : null,
  warn = (msg, err) => console.warn(msg, err),
}: RequestImmersiveVrOptions): Promise<boolean> {
  if (world.session != null || world.sessionRequestPending === true) {
    return false;
  }

  if (xrSystem == null || typeof xrSystem.isSessionSupported !== 'function') {
    onStatusMessage(VR_UNAVAILABLE_MESSAGE);
    return false;
  }

  let isSupported = false;
  try {
    isSupported = await xrSystem.isSessionSupported('immersive-vr');
  } catch (err: unknown) {
    warn('[XR] isSessionSupported check failed:', err);
    isSupported = false;
  }

  if (!isSupported) {
    onStatusMessage(VR_UNAVAILABLE_MESSAGE);
    return false;
  }

  onStatusMessage(null);

  const originalRequestSession = xrSystem.requestSession.bind(xrSystem);
  let requestFailed = false;

  const wrappedRequestSession: typeof xrSystem.requestSession = (
    mode: XRSessionMode,
    options?: XRSessionInit,
  ): Promise<XRSession> => {
    try {
      return Promise.resolve(originalRequestSession(mode, options)).catch((err: unknown) => {
        requestFailed = true;
        warn('[XR] Failed to start XR session:', err);
        onStatusMessage(VR_SESSION_ERROR_MESSAGE);
        return undefined as unknown as XRSession;
      });
    } catch (err: unknown) {
      requestFailed = true;
      warn('[XR] Failed to start XR session:', err);
      onStatusMessage(VR_SESSION_ERROR_MESSAGE);
      return Promise.resolve(undefined as unknown as XRSession);
    } finally {
      try {
        xrSystem.requestSession = originalRequestSession;
      } catch {
        // Ignore if xrSystem.requestSession is non-writable in a custom polyfill
      }
    }
  };

  try {
    xrSystem.requestSession = wrappedRequestSession;
  } catch {
    // Continue even if requestSession property is non-writable
  }

  try {
    world.launchXR();
  } catch (err: unknown) {
    requestFailed = true;
    warn('[XR] Failed to start XR session:', err);
    onStatusMessage(VR_SESSION_ERROR_MESSAGE);
    try {
      xrSystem.requestSession = originalRequestSession;
    } catch {
      // Ignore
    }
    return false;
  }

  return !requestFailed;
}
