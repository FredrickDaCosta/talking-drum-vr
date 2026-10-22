# Test Plan & Verification Evidence (`docs/TEST_PLAN.md`)

## 1. Verification Layers

1. **Static Analysis:** ESLint (`npm run lint`), Prettier (`npm run format:check`), and strict TypeScript (`npm run typecheck`).
2. **Unit Tests (Vitest):** `npm run test:unit` validates pure logic modules:
   - `tests/unit/flags.test.ts` (`?xrfps=1`, `?debug=1`, `?hand=left|right`)
   - `tests/unit/xr-launch.test.ts` (unsupported-VR guardrails)
   - `tests/unit/xr-profiles.test.ts` (local `/xr-profiles/generic-hand/{left,right}.glb` resolution & controller visual no-op)
   - `tests/unit/one-euro-filter.test.ts` (`OneEuroFilter3D` smoothing, dropout reset, and $\le 13.89\text{ ms}$ lag gate at $\ge 0.5\text{ m/s}$)
   - `tests/unit/strike-detector.test.ts` (`detectStrike` swept plane crossing, `0.30 m/s` speed threshold, `0.02 m` / `150 ms` approach-travel anti-jitter gate, `90 ms` debounce, `0.12 m` hit radius, and `allowSecondaryHand: false`)
   - `tests/unit/drum-orientation.test.ts` (single source of truth for drum half-length `0.19 m` and head radius `0.11 m`, zero baked asset rotation, `rotationDeg: [30, 0, 0]`, pure-maths top-head normal `(0, 0.8660254, 0.5)`, and tilted top-head centre `[0, 1.4145, -0.4050]` at `0.4454 m` $\le 0.61\text{ m}$ reach from `[0, 1.6, 0]`)
   - `tests/unit/hand-tracker.test.ts` (`HandTracker` palm midpoint vs. `index-finger-tip`, `TRACKED`/`EMULATED`/`UNTRACKED` gating, world-to-drum-local transform, and `strikeFilter` vs. `visualFilter` separation)
3. **Content & Bundle Budget Checks:**
   - `npm run content:validate` validates `public/scenes/main.iwsdk.scene.json` against the `@iwsdk/scene-composition` `iwsdk.scene.v1` schema and verifies `talking-drum.transform.rotationDeg`.
   - `npm run budget:check` enforces initial-load JS $\le 1.50\text{ MB}$ gzipped and total `dist/` $\le 25.00\text{ MB}$.
4. **End-to-End & Live Smoke Tests (Playwright in GitHub Actions):**
   - `npm run test:e2e` (against `vite preview` in CI) and `npm run test:e2e:live` (against deployed `https://drum.da-costa.online/`):
     1. Clean load with zero console/page errors, zero HTTP $\ge 400$ responses, zero failed network requests, zero third-party requests, visible `Enter VR` button, and runtime world quaternion / top-head normal near `(0, 0.866, 0.5)`.
     2. `?xrfps=1&debug=1` query flags mount `FpsOverlay` and `DebugHud` (`hand(right): UNTRACKED | skin: n/a | strikes: 0`) cleanly with zero console errors or third-party requests.
     3. Clicking `Enter VR` in headless Chromium (no WebXR runtime) checks `navigator.xr.isSessionSupported('immersive-vr')`, avoids calling `requestSession`, logs zero console errors, and displays the accessible `role="status"` message.
     4. Injected IWER (`iwer@2.6.0`) in **hand mode** (`?debug=1`): enters `immersive-vr`, verifies local `/xr-profiles/generic-hand/{left,right}.glb` requests, and scripts the right-hand joints so **(a)** a fast downward strike through the top-head centre increments the HUD strike count by **1**, **(b)** a slow descent (`0.08 m/s`), an off-rim strike (`r = 0.17 m`), and a $\pm 2.5\text{ mm}$ jitter-at-the-plane path each produce **0** hits, and **(c)** zero console errors and zero third-party network requests occur.
     5. Injected IWER (`iwer@2.6.0`) in **controller mode**: enters `immersive-vr` and verifies zero third-party requests and zero console errors.
5. **Manual XR Emulator & Device Verification:** Desktop Chrome with the Immersive Web Emulator extension (`v2.0.0`) on `https://drum.da-costa.online/` and physical Meta Quest Browser verification.

### 1.1 What CI Automated E2E Proves vs. What Requires a Physical Headset

| Verification Target                                                                                                                                                                                                   | Proven by CI (Vitest + Playwright with Injected IWER)?            | Requires Manual Emulator / Physical Meta Quest?    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| Pure math (`OneEuroFilter3D` lag $\le 1$ frame, `detectStrike` speed/radius/debounce/approach-travel gates, `HandTracker` transforms)                                                                                 | **Yes** (`npm run test:unit`, 36/36 tests)                        | No                                                 |
| Runtime `talking-drum` world quaternion & `30°` tilted top-head world normal `(0, 0.866, 0.5)`                                                                                                                        | **Yes** (`tests/e2e/smoke.spec.ts`)                               | No                                                 |
| End-to-end `XRFrame.getJointPose` $\rightarrow$ `HandTracker` $\rightarrow$ `StrikeDetector` $\rightarrow$ `StrikeSystem` $\rightarrow$ `DebugHud` strike count & rejection of slow descent / rim miss / plane jitter | **Yes** (`tests/e2e/smoke.spec.ts` with scripted IWER right hand) | No                                                 |
| Zero console errors and zero third-party network requests before and during XR hand/controller sessions                                                                                                               | **Yes** (`tests/e2e/smoke.spec.ts`)                               | No                                                 |
| Chrome extension UI workflow for switching Immersive Web Emulator (`v2.0.0`) between controllers and hands on `https://drum.da-costa.online/`                                                                         | **No** (CI injects `iwer` programmatically via `addInitScript`)   | **Yes** (Fredrick manual emulator checklist below) |
| Real optical hand-tracking noise, self-occlusion, palm vs. fingertip ergonomics, and physical seated reach at `0.50 m`                                                                                                | **No**                                                            | **Yes** (Physical Meta Quest headset)              |

---

## 2. M0 Verification Results & Evidence (`2026-10-21` — Historical Record)

> [!NOTE]
> **Historical URL Note:** At the time M0 was verified and closed on `2026-10-21`, the live URL was `https://fredrickdacosta.github.io/talking-drum-vr/`. That `github.io` address now returns an `HTTP 301` redirect to the production custom domain **`https://drum.da-costa.online/`**.
>
> **New-Origin Emulator Rerun Requirement:** Because Chrome extensions and the Immersive Web Emulator (`v2.0.0`) treat `https://drum.da-costa.online/` as a new site origin distinct from `https://fredrickdacosta.github.io`, both the **emulator session check** and the **hand-tracking check** must be rerun directly on **`https://drum.da-costa.online/`**.

### 2.1 Automated CI, Deploy, and Live Smoke Evidence (M0)

- **Live URL (Historical M0 Origin):** `https://fredrickdacosta.github.io/talking-drum-vr/` _(now `301` redirects to `https://drum.da-costa.online/`)_
- **Initial M0 Deploy & Live Smoke (`#1`):**
  - Run: `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39653130114`
  - `Build & Deploy Pages`: `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39653130114/job/119406369492` (`success`)
  - `Live Smoke Test` (2/2 passed): `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39653130114/job/119406775841` (`success`)
  - Bundle numbers: `0.826 MB` gzipped initial-load JS (`826,284 B`), `3.569 MB` total `dist/` (`3,569,107 B`).
- **Part A Unsupported-VR Handling Deploy & Live Smoke (`#8`):**
  - Run: `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39682981278`
  - `Build & Deploy Pages`: `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39682981278/job/119509869716` (`success`)
  - `Live Smoke Test` (3/3 passed): `https://github.com/FredrickDaCosta/talking-drum-vr/actions/runs/39682981278/job/119510219506` (`success`)
  - Bundle numbers: `0.827 MB` gzipped initial-load JS (`826,767 B`), `3.572 MB` total `dist/` (`3,571,683 B`).

### 2.2 Manual Immersive Web Emulator Check (`2026-10-21`, Historical Origin)

- **Target URL tested (M0):** `https://fredrickdacosta.github.io/talking-drum-vr/?xrfps=1&debug=1` _(historical origin; now redirects `301` to `https://drum.da-costa.online/` — must be rerun on `https://drum.da-costa.online/?xrfps=1&debug=1`)_
- **Environment:** Desktop Chrome with the **Immersive Web Emulator** extension (`v2.0.0`, site access set to `"On all sites"`).
- **Result:** **PASS** (for M0 `Enter VR` session lifecycle and clean console on the historical origin).
  - Clicking **Enter VR** started the immersive WebXR session cleanly.
  - Left and right controllers appeared in the emulated scene, the spatial welcome card button switched to **"Exit to Browser"**, and the DOM button switched to **"Exit VR"**.
  - DevTools Console showed **zero red console errors** during the session.
- **Scope & Deferred Hand-Tracking Check:** This M0 emulator check covered `Enter VR` session entry/exit and a clean console in default controller mode. **Hand-tracking mode was not checked in M0 and must be verified on the new origin `https://drum.da-costa.online/` using the checklist in Section 3 below.**
- **Emulator Frame Rate Note (Informational Only):** Observed frame rate in the `?xrfps=1` overlay during desktop emulation was **23 FPS**. This reflects desktop browser + extension emulation overhead and is **not** a Meta Quest hardware measurement; it is recorded strictly as an informational note and never treated as a pass/fail gate.

### 2.3 Desktop Chrome Performance Baseline (Pre-Loading-Screen Reference)

Measured on `https://fredrickdacosta.github.io/talking-drum-vr/?xrfps=1&debug=1` _(historical M0 URL; now redirects `301` to `https://drum.da-costa.online/`)_ in desktop Chrome:

| Metric                              | Baseline Value | Notes                                                                                |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| **LCP (Largest Contentful Paint)**  | `3.35 s`       | LCP candidate element was `#xr-debug-hud` (`?debug=1`), reflecting ~3 s boot/preload |
| **CLS (Cumulative Layout Shift)**   | `0.00`         | Zero layout shift during canvas, HUD, and spatial panel initialisation               |
| **INP (Interaction to Next Paint)** | `80 ms`        | Responsive button interaction                                                        |

- **Console on plain desktop load:** Clean apart from benign Windows ANGLE/D3D shader compiler warnings (`X4122` / `X4008`), which are intentionally left unsuppressed.
- **Usage:** This `3.35 s` LCP measurement serves as the reference baseline for evaluating the lightweight startup loading indicator in Phase 1 (Stage M1c).

---

## 3. Fredrick Manual Emulator Test Checklist (`https://drum.da-costa.online/`)

> [!NOTE]
> **M1b emulator check: VERIFIED by Fredrick (2026-10-22)** on `https://drum.da-costa.online/?xrfps=1&debug=1`. Results are in §3.1. The M1c audio checklist is in §3.2.
> Real-Quest feel, strike thresholds and audio latency remain **UNVERIFIED** until tested on a headset.

1. **New-Origin Extension Access & Load Check:**
   - Open `https://drum.da-costa.online/?xrfps=1&debug=1` in desktop Chrome with the **Immersive Web Emulator (`v2.0.0`)** extension enabled (confirm extension site access is allowed on `https://drum.da-costa.online`).
   - Confirm the tilted talking drum is fully visible (no lower-edge cropping) and the welcome panel sits cleanly above the drum: `[ ___ ]`
   - Initial `#xr-debug-hud` text before entering VR: `[ ___ ]` _(expected: `DEBUG HUD | hand(right): UNTRACKED | skin: n/a | strikes: 0 | speed: 0.00m/s | radial: 0.000m`)_
2. **Enter VR on New Origin (`https://drum.da-costa.online/`):**
   - Click **Enter VR** (`#enter-vr-button`).
   - Does the session start and switch the button to **Exit VR**? `[ ___ ]`
   - Any red errors in Chrome DevTools Console? `[ ___ ]`
3. **Switch Emulator Input Mode from Controllers to Hands (verified: the toolbar input-mode icon):**
   - Locate the Immersive Web Emulator (`v2.0.0`) on-page toolbar / panel.
   - Exact control / toggle label used to switch from Controllers to Hands: `[ ___ ]`
   - Do the local white-outlined hand meshes appear and does `hand(right):` in `#xr-debug-hud` change from `UNTRACKED` to `TRACKED` (or `EMULATED`)? `[ ___ ]`
4. **Right-Hand Drum Strike Check in Emulator:**
   - Move the emulated right hand above the tilted top drumhead (`skin:` shows a positive distance $\ge +0.020\text{m}$) and move it briskly downward through the drumhead centre.
   - Observed `#xr-debug-hud` readout after strike (`strikes`, `speed`, `radial`): `[ ___ ]`
   - Observed informational FPS in `#xr-fps-overlay` (note only, not pass/fail): `[ ___ ]`

### 3.1 M1b Results (Fredrick, Immersive Web Emulator, 2026-10-22): VERIFIED

| Check                                    | Result                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Switch Controllers → Hands               | The **input-mode icon** on the emulator's on-page toolbar switches hand mode on                 |
| Right-hand state                         | `hand(right): TRACKED`                                                                          |
| Fast strikes through the cream drum head | Register. The counter reached **21**; last hit **3.03 m/s**, radial **0.107 m** (inside 0.12 m) |
| Slow passes                              | Do not register                                                                                 |
| Rim miss                                 | **Not observed by hand** (covered by the scripted e2e rim-miss case only)                       |
| Console                                  | No red errors; only Three.js / shader warnings                                                  |
| Real-Quest feel, thresholds, latency     | **UNVERIFIED** (needs a physical headset)                                                       |

### 3.2 M1c Audio Checklist (Fredrick, after the M1c PR is deployed)

Open `https://drum.da-costa.online/?xrfps=1&debug=1`, click **Enter VR**, and switch the emulator to hands.

1. Before any click, the second HUD line reads `software + audio buffer estimate … | audio no-context | voices 0`: `[ ___ ]`
2. After Enter VR, the HUD shows `audio running`: `[ ___ ]`
3. A fast strike plays an audible drum tone, and harder strikes sound louder: `[ ___ ]`
4. Slow passes stay silent: `[ ___ ]`
5. The `pipeline … ms`, `base … ms` and `out … ms` (or `n/a`) values after a strike: `[ ___ ]`
   _(software + audio-buffer estimate only; NOT hand-tracking or end-to-end latency)_
6. Switch the emulator back to controllers. After about 3 s, the status shows _"Only controllers are active — please put your controllers down and enable hand tracking to play the talking drum."_ It clears when hands return: `[ ___ ]`
7. On first load, the "Loading Talking Drum VR…" banner appears briefly and then disappears: `[ ___ ]`
8. Any red console errors: `[ ___ ]`
