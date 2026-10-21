import { describe, expect, it, vi } from 'vitest';
import {
  buildLocalHandProfileAssetUrl,
  configureLocalXrVisuals,
  createLocalAnimatedHandClass,
  normalizeBaseUrl,
} from '../../src/platform/xr-profiles.js';

describe('xr-profiles local visual configuration', () => {
  it('builds root and sub-path local hand GLB URLs without external CDN origins', () => {
    expect(normalizeBaseUrl('/')).toBe('/');
    expect(normalizeBaseUrl('/talking-drum-vr')).toBe('/talking-drum-vr/');
    expect(buildLocalHandProfileAssetUrl('/', 'left')).toBe('/xr-profiles/generic-hand/left.glb');
    expect(buildLocalHandProfileAssetUrl('/', 'right')).toBe('/xr-profiles/generic-hand/right.glb');
    expect(buildLocalHandProfileAssetUrl('/custom-subpath/', 'left')).toBe(
      '/custom-subpath/xr-profiles/generic-hand/left.glb',
    );
  });

  it('creates AnimatedHand subclasses with static assetPath pointing to local xr-profiles', () => {
    const LeftHandClass = createLocalAnimatedHandClass('/', 'left');
    const RightHandClass = createLocalAnimatedHandClass('/', 'right');

    expect(LeftHandClass.assetPath).toBe('/xr-profiles/generic-hand/left.glb');
    expect(RightHandClass.assetPath).toBe('/xr-profiles/generic-hand/right.glb');
    expect(LeftHandClass.assetProfileId).toBe('generic-hand');
    expect(LeftHandClass.assetKeyPrefix).toBe('hand-');
  });

  it('configures hand adapters via updateVisualImplementation and replaces controller connectVisual with a no-op', () => {
    const leftHandUpdate = vi.fn();
    const rightHandUpdate = vi.fn();
    const leftCtrlConnectVisual = vi.fn();
    const rightCtrlConnectVisual = vi.fn();

    const fakeWorld = {
      input: {
        xr: {
          visualAdapters: {
            hand: {
              left: { updateVisualImplementation: leftHandUpdate },
              right: { updateVisualImplementation: rightHandUpdate },
            },
            controller: {
              left: {
                toggleVisual: vi.fn(),
                disconnectVisual: vi.fn(),
                connectVisual: leftCtrlConnectVisual,
              },
              right: {
                toggleVisual: vi.fn(),
                disconnectVisual: vi.fn(),
                connectVisual: rightCtrlConnectVisual,
              },
            },
          },
        },
      },
    };

    configureLocalXrVisuals(
      fakeWorld as unknown as Parameters<typeof configureLocalXrVisuals>[0],
      '/',
    );

    expect(leftHandUpdate).toHaveBeenCalledTimes(1);
    expect(rightHandUpdate).toHaveBeenCalledTimes(1);
    const [passedLeftClass] = leftHandUpdate.mock.calls[0] as [{ assetPath?: string }];
    const [passedRightClass] = rightHandUpdate.mock.calls[0] as [{ assetPath?: string }];
    expect(passedLeftClass.assetPath).toBe('/xr-profiles/generic-hand/left.glb');
    expect(passedRightClass.assetPath).toBe('/xr-profiles/generic-hand/right.glb');

    // Controller connectVisual must now be a no-op so controller GLBs are never fetched
    fakeWorld.input.xr.visualAdapters.controller.left.connectVisual();
    fakeWorld.input.xr.visualAdapters.controller.right.connectVisual();
    expect(leftCtrlConnectVisual).not.toHaveBeenCalled();
    expect(rightCtrlConnectVisual).not.toHaveBeenCalled();
  });
});
