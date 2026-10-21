# Architecture Overview (M0 Stub)

## Stack

- **Runtime & ECS:** Immersive Web SDK (`@iwsdk/core` 1.0.1) + Three.js (`super-three` 0.181.0)
- **Language & Build:** TypeScript (strict) + Vite (`BASE_PATH` configurable, default `/talking-drum-vr/`)
- **Node Runtime:** Node 24 (`>=20.19` supported; see [ADR-007](adr/ADR-007.md))

## Directory Layout

- `iwsdk.config.json`: Project authority for XR mode (`vr`), `handTracking: true`, camera, and scene/asset/component manifests.
- `src/app/`: Central configuration (`config.ts`), URL query flag parser (`flags.ts`), and ECS components.
- `src/scene-assets/`: Deterministic procedural Three.js `Object3D` prototypes (`talking-drum.scene-asset.ts`).
- `src/ui/` & `src/debug/`: Diagnostic overlays (`?xrfps=1` FPS overlay, `?debug=1` debug HUD stub).
- `src/input/`, `src/audio/`, `src/game/`, `src/content/`, `src/platform/`: Reserved for Phase 1+ subsystems.
