# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Stage M1b — Tilted Drum Orientation, `HandTracker`, `StrikeSystem` & `DebugHud` Telemetry:**
  - Hardened `detectStrike` (`src/game/strike-detector.ts`) with an allocation-free 32-sample approach-window ring buffer (`minApproachTravelMeters: 0.02`, `approachWindowMs: 150`) so $\pm 2.5\text{ mm}$ hover jitter at `72 Hz` produces zero false hits while quick taps from $\ge 2\text{ cm}$ above the skin plane register cleanly.
  - Oriented `talkingDrumAsset` (`src/scene-assets/talking-drum.scene-asset.ts`) vertically along $+Y$ with zero baked rotation, sharing `lengthMeters` (`0.38 m`, half-length `0.19 m`) and `headRadiusMeters` (`0.11 m`) from `APP_CONFIG.drumGeometry`, and tilted the drum `30°` toward the seated player via `"rotationDeg": [30, 0, 0]` in `public/scenes/main.iwsdk.scene.json` (placing the top drumhead centre at `[0, 1.4145, -0.4050]`, `0.4050 m` horizontally / `0.4454 m` 3D Euclidean from default eye level `[0, 1.6, 0]`, within the `0.61 m` reach limit).
  - Raised `welcome-panel` (`[0, 1.76, -1.35]`, `scale: 0.32`) and tuned desktop camera framing (`position: [0, 1.6, 0.45]`, `lookAt: [0, 1.35, -0.5]`) so the drum and welcome card no longer overlap or crop at the lower edge.
  - Added allocation-free `HandTracker` (`src/input/hand-tracker.ts`), `StrikeSystem` (`src/game/strike-system.ts`), `?hand=left|right` flag parsing (`src/app/flags.ts`), throttled `DebugHud` telemetry (`src/debug/debug-hud.ts`), and scripted IWER right-hand strike e2e tests (`tests/e2e/smoke.spec.ts`).
- **Stage M1a — Local XR Hand Profiles & Pure Strike Core (`f1245d5`):**
  - Vendored `@webxr-input-profiles/assets@1.0.20` generic-hand meshes (`public/xr-profiles/generic-hand/left.glb`, `right.glb`, `LICENSE`) and wired local hand visual adapters (`src/platform/xr-profiles.ts`) with zero third-party network requests.
  - Added allocation-free `OneEuroFilter3D` (`src/input/one-euro-filter.ts`), pure `detectStrike` (`src/game/strike-detector.ts`), synthetic 72 Hz hand-path fixtures (`tests/fixtures/hand-paths.ts`), and unit/e2e test suites.

### Changed

- **Custom Domain & Root Base Path (`drum.da-costa.online`):** Switched default `BASE_PATH` from `/talking-drum-vr/` to `/` and default `LIVE_URL` to `https://drum.da-costa.online/` across Vite, Playwright, GitHub Actions CI/Deploy workflows, and documentation following GitHub Pages custom domain verification and HTTPS enforcement (`301` redirect from `https://fredrickdacosta.github.io/talking-drum-vr/` to `https://drum.da-costa.online/`).

## [m0] - 2026-10-21 ("Hello XR" Baseline)

### Release Metadata

- **Date:** `2026-10-21`
- **Tag:** `m0`
- **Live URL (Historical M0 Origin):** `https://fredrickdacosta.github.io/talking-drum-vr/` _(Note: this was the live `github.io` URL at the time M0 closed; it now returns an `HTTP 301` redirect to `https://drum.da-costa.online/`.)_
- **Toolchain & Core Versions:**
  - **Node.js:** `v24.14.1` (`npm 11.17.0`, `"engines": { "node": ">=20.19" }`)
  - **IWSDK (`@iwsdk/core`, `@iwsdk/cli`, `@iwsdk/vite-plugin-dev`):** `1.0.1`
  - **Three.js:** `super-three@0.181.0`
  - **Vite:** `7.3.7` (`^7.1.4` declared)
- **Bundle Metrics:**
  - **Initial M0 Deploy (`#1`):** Initial-load JS `826,284 B` (`0.826 MB` gzipped, `2.806 MB` raw; limit `1.50 MB` gzipped) | Total `dist/` `3,569,107 B` (`3.569 MB`, 18 files; limit `25.00 MB`)
  - **Post-Part-A M0 Close (`#8`):** Initial-load JS `826,767 B` (`0.827 MB` gzipped, `2.807 MB` raw; limit `1.50 MB` gzipped) | Total `dist/` `3,571,683 B` (`3.572 MB`, 18 files; limit `25.00 MB`)
- **Deployment & Live Smoke Evidence:**
  - **Initial M0 Deploy Run (`#1`):** `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39653130114`
    - Deploy Job (`Build & Deploy Pages`): `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39653130114/job/119406369492` (`success`)
    - Live Smoke Job (`Live Smoke Test`, 2/2 passed): `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39653130114/job/119406775841` (`success`)
  - **Part A Deploy Run (`#8`):** `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39682981278`
    - Deploy Job (`Build & Deploy Pages`): `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39682981278/job/119509869716` (`success`)
    - Live Smoke Job (`Live Smoke Test`, 3/3 passed): `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39682981278/job/119510219506` (`success`)

### Added & Fixed in M0

- Scaffolded IWSDK `1.0.1` VR TypeScript application with WebXR `handTracking: true` and strict TypeScript/ESLint/Prettier governance.
- Added procedural placeholder Yoruba talking drum (_gángan_) at `0.5 m` ahead and `0.35 m` below seated eye level.
- Added central configuration (`src/app/config.ts`) and URL query flag parser (`src/app/flags.ts`) supporting `?xrfps=1` (`FpsOverlay`) and `?debug=1` (`DebugHud` stub).
- Configured sub-path-safe asset resolution via `BASE_PATH` (`/talking-drum-vr/`) and automated GitHub Actions CI, CodeQL, and GitHub Pages deployment + Playwright live smoke workflows.
- Added friendly unsupported-VR handling (`src/platform/xr-launch.ts`, `src/panel.ts`, `index.html`, `public/ui/welcome.uikitml`): checks `navigator.xr` and `await navigator.xr.isSessionSupported('immersive-vr')` on every `Enter VR` click, skips `requestSession` without console errors when unsupported, and renders an accessible `role="status"` message in both the DOM HUD and spatial welcome panel (`"VR isn't available in this browser. Open this page in Meta Quest Browser, or on a desktop use the Immersive Web Emulator extension."`), while logging unexpected `requestSession` failures via `console.warn` with a retry hint.
