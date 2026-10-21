# Test Plan & M0 Verification Evidence (`docs/TEST_PLAN.md`)

## 1. Verification Layers

1. **Static Analysis:** ESLint (`npm run lint`), Prettier (`npm run format:check`), and strict TypeScript (`npm run typecheck`).
2. **Unit Tests (Vitest):** `npm run test:unit` validates pure logic modules (`src/app/flags.ts`, `src/platform/xr-launch.ts`).
3. **Content & Bundle Budget Checks:**
   - `npm run content:validate` validates scene JSON structure and node references.
   - `npm run budget:check` enforces initial-load JS $\le 1.50\text{ MB}$ gzipped and total `dist/` $\le 25.00\text{ MB}$.
4. **End-to-End & Live Smoke Tests (Playwright in GitHub Actions):**
   - `npm run test:e2e` (against `vite preview` in CI) and `npm run test:e2e:live` (against deployed `LIVE_URL`):
     1. Clean load with zero console/page errors, zero HTTP $\ge 400$ responses, zero failed network requests, zero third-party requests, and visible `Enter VR` button.
     2. `?xrfps=1&debug=1` query flags mount `FpsOverlay` and `DebugHud` cleanly with zero console errors or third-party requests.
     3. Clicking `Enter VR` in headless Chromium (no WebXR runtime) checks `navigator.xr.isSessionSupported('immersive-vr')`, avoids calling `requestSession`, logs zero console errors, and displays the accessible `role="status"` message (`"VR isn't available in this browser. Open this page in Meta Quest Browser, or on a desktop use the Immersive Web Emulator extension."`).
5. **Manual XR Emulator & Device Verification:** Desktop Chrome with the Immersive Web Emulator extension (`v2.0.0`) and physical Meta Quest Browser verification.

---

## 2. M0 Verification Results & Evidence (`2026-10-21`)

### 2.1 Automated CI, Deploy, and Live Smoke Evidence

- **Live URL:** `https://fredrickdacosta.github.io/talking-drum-vr/` (`HTTP/1.1 200 OK` over enforced HTTPS)
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

### 2.2 Manual Immersive Web Emulator Check (`2026-10-21`)

- **Target URL tested:** `https://fredrickdacosta.github.io/talking-drum-vr/?xrfps=1&debug=1`
- **Environment:** Desktop Chrome with the **Immersive Web Emulator** extension (`v2.0.0`, site access set to `"On all sites"`).
- **Result:** **PASS** (for M0 `Enter VR` session lifecycle and clean console).
  - Clicking **Enter VR** started the immersive WebXR session cleanly.
  - Left and right controllers appeared in the emulated scene, the spatial welcome card button switched to **"Exit to Browser"**, and the DOM button switched to **"Exit VR"**.
  - DevTools Console showed **zero red console errors** during the session.
- **Scope & Deferred Hand-Tracking Check:** This M0 emulator check covered `Enter VR` session entry/exit and a clean console in default controller mode. **Hand-tracking mode was not checked in M0 and is explicitly deferred to Phase 1 (M1).**
- **Emulator Frame Rate Note (Informational Only):** Observed frame rate in the `?xrfps=1` overlay during desktop emulation was **23 FPS**. This reflects desktop browser + extension emulation overhead and is **not** a Meta Quest hardware measurement; it is recorded strictly as an informational note and never treated as a pass/fail gate.

### 2.3 Desktop Chrome Performance Baseline (Pre-Loading-Screen Reference)

Measured on `https://fredrickdacosta.github.io/talking-drum-vr/?xrfps=1&debug=1` in desktop Chrome:

| Metric                              | Baseline Value | Notes                                                                                |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| **LCP (Largest Contentful Paint)**  | `3.35 s`       | LCP candidate element was `#xr-debug-hud` (`?debug=1`), reflecting ~3 s boot/preload |
| **CLS (Cumulative Layout Shift)**   | `0.00`         | Zero layout shift during canvas, HUD, and spatial panel initialisation               |
| **INP (Interaction to Next Paint)** | `80 ms`        | Responsive button interaction                                                        |

- **Console on plain desktop load:** Clean apart from benign Windows ANGLE/D3D shader compiler warnings (`X4122` / `X4008`), which are intentionally left unsuppressed.
- **Usage:** This `3.35 s` LCP measurement serves as the reference baseline for evaluating the lightweight startup loading indicator proposed in Phase 1.
