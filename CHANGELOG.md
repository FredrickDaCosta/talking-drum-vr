# Changelog

All notable changes to this project will be documented in this file.

## [m0] - 2026-10-21 ("Hello XR" Baseline)

### Release Metadata

- **Date:** `2026-10-21`
- **Tag:** `m0`
- **Live URL:** `https://fredrickdacosta.github.io/talking-drum-vr/`
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
