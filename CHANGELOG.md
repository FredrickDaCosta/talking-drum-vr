# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Phase 2, step P2d (in-VR debug panel, `?debug=1` only):**
  - A panel low and right of the drum, facing the player. It shows FPS and frame times, frame gap, strikes,
    pipeline and audio latency, hand states, squeeze, band, pitch, calibration, audio skips, lesson step and
    marks, refreshed at 4 Hz.
  - Touch it with the RIGHT index finger to add a timestamped mark (ring buffer). Touch it with the LEFT index
    finger to hide or show it. Keyboard: Backquote toggles, M marks.
  - `lesson.phrasesPerLevel: 'all'`, so new content entries play without code changes.
  - `docs/CONTENT_ADDITIONS.md`.
  - `docs/QUEST_TEST_PLAN.md` now reads the panel in VR.
- **Phase 2, step P2c (polish, onboarding, length, Quest test plan):**
  - **Title screen:** it states both controls and "Strike the drum to begin". The welcome panel is hidden for
    the whole XR session, and the hands-required notice moved to the lesson panel.
  - **Left hand lost:** during "Your turn" the panel shows "Show your left hand to change pitch"; the pitch
    holds at mid.
  - **Session:** L1 has 8 tone drills (3 new; no words), L2 plays all 12 words grouped by minimal sets, and L3
    all 4 phrases. Each level starts with a plain "Level N" intro.
  - **Pacing:** retimed; a model in `src/game/session-estimate.ts` gives ≈5.3 min at a normal pace.
  - **End screen:** total stars and a short message. "Strike the drum to play again" restarts without a
    reload.
  - **Feedback sounds:** an original procedural "correct" chime and "try again" tone, quieter than the drum.
  - **Robustness:** demo voices stop on XR exit or a hidden tab; the demo restarts on return; calibration
    retries once before using the defaults; strikes during a demo are ignored.
  - **Debug HUD:** the lesson line shows a per-frame cost reading.
  - **Docs:** `docs/QUEST_TEST_PLAN.md`, a printable 45-minute Quest session plan.
- **Content review:** all 16 level-2/3 entries are reviewed by Fredrick and marked `verified`; a second
  native-speaker review is pending.
- **Phase 2, step P2b (lesson engine and content):**
  - Typed lesson data (`src/content/lessons.ts`; types in `lesson-types.ts`): 5 level-1 tone drills
    (verified), plus 12 level-2 and 4 level-3 entries from the starter list (all `draft`).
  - `content:validate` checks lessons with `src/content/validate-lessons.ts`. It checks unique ids, that
    tones match syllables, that tones are L/M/H only, NFC text, spelling, and a minimum per level. It also
    logs draft ids; drafts do not fail the build.
  - Pure "listen, then echo" reducer (`src/game/lesson-machine.ts`) with a thin `LessonSystem`. The phases
    are: title, calibration, level intro, demo, your turn, evaluate, feedback, level complete, end.
    - Stars are 3/2/1 for a correct echo on the 1st/2nd/3rd try. After the third miss the answer is
      replayed and the phrase scores 0 stars.
    - With no strike for 10 s, the demo replays without costing a try.
  - `DrumAudio.playAt(when, { velocity, pitchRatio })`: demos are scheduled on the `AudioContext` clock.
  - In-world lesson panel above the drum, drawn to a canvas texture (`src/ui/lesson-panel-canvas.ts`). It
    shows the word, syllables, tone arrows, gloss, state text, try number and stars. It uses a bundled Noto
    Sans subset (OFL, `public/fonts/`) because UIKit's font has no Yoruba letters or tone marks.
  - During a demo, the pitch ladder shows the demo's tones.
  - `?debug=1` HUD lesson line; `?lesson=<id>` starts at a phrase.
- **Phase 2, step P2a (pitch-hand squeeze and pitch):**
  - Squeeze 0..1 from the left hand's WebXR joints (`src/input/hand-squeeze.ts`): tip → own-knuckle curl
    normalised by palm length, One Euro smoothing, and hold-then-neutral on dropouts.
  - Guided open/fist calibration with median capture and sanity checks (`src/input/squeeze-calibration.ts`).
    `?calib=0` skips it.
  - Log pitch mapping 0.75–1.0–1.33 and L/M/H bands with hysteresis (`src/game/pitch-mapping.ts`). The
    squeeze is latched on the strike frame and passed to `DrumAudio.play({ velocity, pitchRatio })`.
  - In-world three-rung pitch ladder (`src/game/pitch-ladder-system.ts`) and a `?debug=1` HUD pitch line.
  - `docs/PHASE2_PLAN.md`.
- **Audio diagnostics and safe resume (#24):** `voices started` / `active`, max pipeline and max frame gap
  over 5 s, skip counts by reason; `AudioContext` resume on statechange, visibility and XR session changes,
  gated on a user gesture.

## [m1] - 2026-10-23 (Hands-Only Strike Detection & Drum Sound)

### Release Metadata

- **Date:** `2026-10-23`
- **Tag:** `m1` (annotated, on `main` after PR #21 `3ae807c` and this release-notes commit; not a `v*` tag, so it does not trigger a deploy)
- **Live URL:** `https://drum.da-costa.online/`
- **Toolchain & Core Versions:** Node.js 24 in CI (`"engines": { "node": ">=20.19" }`); IWSDK `1.0.1`; Three.js `super-three@0.181.0`; Vite `7.3.7`; Vitest `4.1.12`; Playwright `1.64.1`; sharp override `0.35.5`
- **Bundle Metrics (M1c deploy):** Initial-load JS `834,364 B` (`0.834 MB` gzipped, `2.835 MB` raw; limit `1.50 MB`) | Total `dist/` `3,790,009 B` (`3.790 MB`, 21 files; limit `25.00 MB`)
- **Quality Gates:**
  - Unit tests 63/63 and e2e 5/5; `npm audit`: 0 vulnerabilities
  - E2E flake closure: IWER hand-strike test passed 30/30 consecutively with retries off (local, `--repeat-each=30`, 5 m 2 s). CI keeps `retries: 1`.
- **Deployment & Live Smoke Evidence (M1c, `3ae807c`):**
  - CI: `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39961741216` (`success`)
  - CodeQL: `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39961741352` (`success`)
  - Deploy run: `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39961741328`
    - Deploy job (`Build & Deploy Pages`): `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39961741328/job/120441167781` (`success`)
    - Live smoke job (`Live Smoke Test`, 5/5 passed): `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39961741328/job/120441643886` (`success`)
- **Verification Scope:** M1b was emulator-verified by Fredrick (2026-10-22). M1c audio has been checked only in the emulator e2e suite, which counts voices rather than listening. **UNVERIFIED** until tested on a Quest: hand-tracking feel, strike thresholds, audible quality and latency, 72/90 FPS thermals, and reach.

### Added in M1

- **Stage M1c — Drum Audio, Latency Probe, Loading & Fallback UX:**
  - `DrumAudio` (`src/audio/drum-audio.ts`): lazy single `AudioContext` unlocked by the Enter VR click or the first page gesture; procedural _gángan_ placeholder rendered via `OfflineAudioContext` (`src/audio/gangan-placeholder.ts`); `play({ velocity, pitchRatio = 1 })` with g = 0.15 + 0.85·v^0.75 over 0.30–3.0 m/s; HRTF panner at the drum head; pooled voice gains. Wired by `DrumAudioSystem` through `StrikeSystem.onStrike`.
  - `?debug=1` HUD line "software + audio buffer estimate (not tracking / end-to-end latency)".
  - Static `#app-loading-banner`, removed on startup and switched to an error message on failure.
  - Controller-only / no-hands XR notice after a 3 s grace period.
  - Player-rig transform safeguard for hand poses (`src/input/reference-space.ts`).
- **Security (2026-10-22):** sharp override 0.35.5 (#14), vitest ^4.1.12 (#15), Dependabot ignore-majors for version updates plus minor/patch groups (#16), eslint/@eslint/js/typescript major ignores (#22). `npm audit`: 0 vulnerabilities.
- **Stage M1b — Tilted Drum Orientation, `HandTracker`, `StrikeSystem` & `DebugHud` Telemetry:**
  - Hardened `detectStrike` (`src/game/strike-detector.ts`) with an allocation-free 32-sample approach-window ring buffer (`minApproachTravelMeters: 0.02`, `approachWindowMs: 150`) so $\pm 2.5\text{ mm}$ hover jitter at `72 Hz` produces zero false hits while quick taps from $\ge 2\text{ cm}$ above the skin plane register cleanly.
  - Oriented `talkingDrumAsset` (`src/scene-assets/talking-drum.scene-asset.ts`) vertically along $+Y$ with zero baked rotation, sharing `lengthMeters` (`0.38 m`, half-length `0.19 m`) and `headRadiusMeters` (`0.11 m`) from `APP_CONFIG.drumGeometry`, and tilted the drum `30°` toward the seated player via `"rotationDeg": [30, 0, 0]` in `public/scenes/main.iwsdk.scene.json` (placing the top drumhead centre at `[0, 1.4145, -0.4050]`, `0.4050 m` horizontally / `0.4454 m` 3D Euclidean from default eye level `[0, 1.6, 0]`, within the `0.61 m` reach limit).
  - Raised `welcome-panel` (`[0, 1.76, -1.35]`, `scale: 0.32`) and tuned desktop camera framing (`position: [0, 1.6, 0.45]`, `lookAt: [0, 1.35, -0.5]`) so the drum and welcome card no longer overlap or crop at the lower edge.
  - Added allocation-free `HandTracker` (`src/input/hand-tracker.ts`), `StrikeSystem` (`src/game/strike-system.ts`), `?hand=left|right` flag parsing (`src/app/flags.ts`), throttled `DebugHud` telemetry (`src/debug/debug-hud.ts`), and scripted IWER right-hand strike e2e tests (`tests/e2e/smoke.spec.ts`).
- **Stage M1a — Local XR Hand Profiles & Pure Strike Core (`f1245d5`):**
  - Vendored `@webxr-input-profiles/assets@1.0.20` generic-hand meshes (`public/xr-profiles/generic-hand/left.glb`, `right.glb`, `LICENSE`) and wired local hand visual adapters (`src/platform/xr-profiles.ts`) with zero third-party network requests.
  - Added allocation-free `OneEuroFilter3D` (`src/input/one-euro-filter.ts`), pure `detectStrike` (`src/game/strike-detector.ts`), synthetic 72 Hz hand-path fixtures (`tests/fixtures/hand-paths.ts`), and unit/e2e test suites.

### Changed in M1

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
