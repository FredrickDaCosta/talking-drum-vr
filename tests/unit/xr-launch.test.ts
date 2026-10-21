import { describe, expect, it, vi } from 'vitest';
import {
  requestImmersiveVrSession,
  VR_SESSION_ERROR_MESSAGE,
  VR_UNAVAILABLE_MESSAGE,
} from '../../src/platform/xr-launch.js';

describe('requestImmersiveVrSession', () => {
  it('shows VR_UNAVAILABLE_MESSAGE and does not call launchXR when navigator.xr is absent', async () => {
    const launchXR = vi.fn();
    const onStatusMessage = vi.fn();
    const warn = vi.fn();

    const started = await requestImmersiveVrSession({
      world: { launchXR },
      onStatusMessage,
      xrSystem: null,
      warn,
    });

    expect(started).toBe(false);
    expect(launchXR).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(onStatusMessage).toHaveBeenCalledExactlyOnceWith(VR_UNAVAILABLE_MESSAGE);
  });

  it('re-checks isSessionSupported on each button press and skips requestSession when unsupported', async () => {
    const isSessionSupported = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const requestSession = vi.fn().mockResolvedValue({} as XRSession);
    const xrSystem = {
      isSessionSupported,
      requestSession,
    } as unknown as XRSystem;

    const launchXR = vi.fn(() => {
      void xrSystem.requestSession('immersive-vr');
    });
    const onStatusMessage = vi.fn();

    const firstAttempt = await requestImmersiveVrSession({
      world: { launchXR },
      onStatusMessage,
      xrSystem,
    });
    expect(firstAttempt).toBe(false);
    expect(isSessionSupported).toHaveBeenCalledTimes(1);
    expect(isSessionSupported).toHaveBeenCalledWith('immersive-vr');
    expect(requestSession).not.toHaveBeenCalled();
    expect(onStatusMessage).toHaveBeenLastCalledWith(VR_UNAVAILABLE_MESSAGE);

    const secondAttempt = await requestImmersiveVrSession({
      world: { launchXR },
      onStatusMessage,
      xrSystem,
    });
    expect(secondAttempt).toBe(true);
    expect(isSessionSupported).toHaveBeenCalledTimes(2);
    expect(requestSession).toHaveBeenCalledTimes(1);
    expect(onStatusMessage).toHaveBeenLastCalledWith(null);
  });

  it('logs via console.warn and shows retry message when isSessionSupported passes but requestSession rejects', async () => {
    const sessionError = new DOMException('NotSupportedError');
    const isSessionSupported = vi.fn().mockResolvedValue(true);
    const requestSession = vi.fn().mockRejectedValue(sessionError);
    const xrSystem = {
      isSessionSupported,
      requestSession,
    } as unknown as XRSystem;

    let sessionPromise: Promise<unknown> | undefined;
    const launchXR = vi.fn(() => {
      sessionPromise = xrSystem.requestSession('immersive-vr');
    });
    const onStatusMessage = vi.fn();
    const warn = vi.fn();

    await requestImmersiveVrSession({
      world: { launchXR },
      onStatusMessage,
      xrSystem,
      warn,
    });

    await sessionPromise;

    expect(warn).toHaveBeenCalledWith('[XR] Failed to start XR session:', sessionError);
    expect(onStatusMessage).toHaveBeenLastCalledWith(VR_SESSION_ERROR_MESSAGE);
    expect(xrSystem.requestSession).toBeTypeOf('function');
  });
});
