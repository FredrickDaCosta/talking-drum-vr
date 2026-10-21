import { AnimatedHand, type VisualConstructor, type World } from '@iwsdk/core';

export type Handedness = 'left' | 'right';

export function normalizeBaseUrl(baseUrl = '/'): string {
  const trimmed = baseUrl.trim() || '/';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function buildLocalHandProfileAssetUrl(baseUrl: string, handedness: Handedness): string {
  return `${normalizeBaseUrl(baseUrl)}xr-profiles/generic-hand/${handedness}.glb`;
}

export function createLocalAnimatedHandClass(
  baseUrl: string,
  handedness: Handedness,
): VisualConstructor<AnimatedHand> {
  const localAssetPath = buildLocalHandProfileAssetUrl(baseUrl, handedness);
  class LocalAnimatedHand extends AnimatedHand {
    static assetPath = localAssetPath;
  }
  return LocalAnimatedHand;
}

interface ControllerAdapterWithProtectedVisualHooks {
  toggleVisual(enabled: boolean): void;
  disconnectVisual(): void;
  connectVisual(): void;
}

/**
 * Configures @iwsdk/xr-input visual adapters so:
 * 1. Hand visuals load vendored @webxr-input-profiles/assets@1.0.20 GLBs from
 *    `${baseUrl}xr-profiles/generic-hand/{left,right}.glb` via the supported
 *    `XRInputVisualAdapter.updateVisualImplementation` + `VisualConstructor.assetPath` hook.
 * 2. Controller visual fetches are disabled (`connectVisual` no-op) because Talking Drum VR
 *    is a hands-only experience and never renders controller meshes.
 */
export function configureLocalXrVisuals(
  world: Pick<World, 'input'>,
  baseUrl = import.meta.env.BASE_URL ?? '/',
): void {
  const { hand, controller } = world.input.xr.visualAdapters;

  hand.left.updateVisualImplementation(createLocalAnimatedHandClass(baseUrl, 'left'));
  hand.right.updateVisualImplementation(createLocalAnimatedHandClass(baseUrl, 'right'));

  for (const handedness of ['left', 'right'] as const) {
    const ctrlAdapter = controller[
      handedness
    ] as unknown as ControllerAdapterWithProtectedVisualHooks;
    ctrlAdapter.toggleVisual(false);
    ctrlAdapter.disconnectVisual();
    ctrlAdapter.connectVisual = () => {
      // No-op: controller GLB meshes are intentionally disabled in this hands-only app.
    };
  }
}
