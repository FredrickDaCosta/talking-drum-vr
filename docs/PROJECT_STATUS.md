# Project Status (`docs/PROJECT_STATUS.md`)

> **Purpose:** Context-reset recovery file. Updated at the end of every stage.
> A new context can read this file and pick up exactly where work left off.

---

## Current Stage

**Stage M1b** — active on branch `feat/m1b-drum-hands-wiring`

- **M1a:** Merged in PR #12 (`f1245d5`) — local XR hand profiles, 3D One Euro filter, pure
  `StrikeDetector`.
- **M1b:** PR #13 open — awaiting Fredrick's approval. All local and CI gates green.
  No audio (M1c scope).
- **M1c:** Next after M1b merges — `DrumAudio`, latency probe, loading banner,
  controller-only guidance message, M1 close.

---

## M1b Item Checklist

| #   | Item                                                                                                                                                                                                                         | Status  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Strike detector hardening (`minApproachTravelMeters: 0.02`, `approachWindowMs: 150`, ring buffer, jitter + quick-tap fixtures)                                                                                               | ✅ Done |
| 2   | Drum orientation (zero baked rotation, `rotationDeg: [30,0,0]`, config single source of truth, head-normal unit test + e2e quaternion check, reach ≤ 0.61 m, panel raised, camera framing)                                   | ✅ Done |
| 3   | `HandTracker` adapter — palm midpoint, index-finger-tip option, NaN/missing gate, TRACKED/EMULATED, allocation-free world→local, dual filter paths, dropout reset                                                            | ✅ Done |
| 4   | `StrikeSystem` — wires HandTracker + detector + `InternalStrikeEvent`, `config.strike.primaryHand`, `allowSecondaryHand`, `?hand=left\|right` flag + unit test                                                               | ✅ Done |
| 5   | `DebugHud` (`?debug=1`) — hand state, skin distance, strike count, last speed, radial position, throttled DOM writes, no latency text                                                                                        | ✅ Done |
| 6   | E2E in IWER hand mode — (a) fast centre strike → +1 hit, (b) slow descent + rim miss + jitter → 0 hits, (c) zero console errors + zero third-party requests                                                                  | ✅ Done |
| 7   | Docs — M1a follow-up URL note + new-origin emulator rerun note in `TEST_PLAN.md`; Fredrick manual emulator checklist (`UNVERIFIED` blanks) in `TEST_PLAN.md §3`; approach-travel trade-off in `PHASE1_PLAN.md §2.3`          | ✅ Done |
| 8   | Gates — lint ✅, format:check ✅, typecheck ✅, unit tests 36/36 ✅, content:validate ✅, build ✅, budget:check ✅ (0.831 MB gzip initial-load JS; limit 1.50 MB); CI ✅ (CodeQL + all steps green, PR #13 run 39771808683) | ✅ Done |
| 9   | `docs/PROJECT_STATUS.md` created in this PR                                                                                                                                                                                  | ✅ Done |

---

## Key Decisions (All Stages)

| Decision             | Value                                                                                                                                                                                     | Rationale                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Custom domain live   | `https://drum.da-costa.online/` (`301` from `https://fredrickdacosta.github.io/talking-drum-vr/`)                                                                                         | Verified HTTPS + GitHub Pages custom domain                                                      |
| Hand mesh source     | Option B — vendored `@webxr-input-profiles/assets@1.0.20` `left.glb` + `right.glb` under `public/xr-profiles/generic-hand/`                                                               | Zero third-party CDN fetches in XR                                                               |
| Strike thresholds    | `minDownwardSpeedMetersPerSec: 0.30`, `minApproachTravelMeters: 0.02 m`, `approachWindowMs: 150 ms`, `debounceMs: 90 ms`, `hitRadiusMarginMeters: 0.01 m`, `rearmDistanceMeters: 0.008 m` | Tuned in `src/app/config.ts`; micro-taps < 2 cm wind-up will not register (documented trade-off) |
| 0.61 m reach rule    | Drum at `distanceAheadMeters: 0.50 m`, tilted top-head centre at `[0, 1.4145, -0.4050]` = `0.4454 m` 3D Euclidean from `[0, 1.6, 0]`                                                      | Satisfies 2 ft (0.61 m) contest reach limit                                                      |
| Left hand role       | `allowSecondaryHand: false` — left hand **reserved for Phase 2 under-arm tension-cord pitch-squeeze**                                                                                     | Prevents accidental left-hand drumhead strikes while squeezing                                   |
| Merge rules          | Fredrick approves each stage PR by pasting the stage prompt; Antigravity does NOT self-merge                                                                                              | Explicit human approval gate per stage                                                           |
| Strike point default | `strikePointMode: 'palm'` (midpoint of wrist + middle-finger-metacarpal)                                                                                                                  | Index-finger-tip available as config option; final choice after physical Quest testing           |
| Drum axis convention | Long axis `+Y` in asset-local space; world tilt via scene `rotationDeg: [30, 0, 0]` (not baked in asset)                                                                                  | Single source of truth; `drum-orientation.test.ts` enforces no baked rotation                    |

---

## Open Tasks

### M1c (Next PR — `feat/m1c-drum-audio`)

- [ ] `DrumAudio` (`src/audio/drum-audio.ts`) — `OfflineAudioContext` _gángan_ placeholder,
      `play({ velocity, pitchRatio })`, `voicesStartedCount`, gain curve.
- [ ] `DebugHud` latency probe — `software pipeline: X.XX ms` and
      `audio buffer estimate (not tracking latency): base X.X ms | out X.X ms (or n/a)`.
- [ ] Startup loading banner — `#app-loading-banner` (`role="status"`) visible at first paint,
      hidden on `World.create()` resolve, plain error on reject.
- [ ] Controller-only XR guidance message —
      _"Only controllers are active — please put your controllers down and enable hand tracking to play the talking drum."_
- [ ] M1 close — verify full DoD (`voicesStartedCount ≥ 1`, all gates green, live smoke).

### Dependabot sharp task

- Sharp `0.32.x` → `0.35.4` pinned in `package.json` `overrides` (satisfies 2 critical advisories).
- 5 open Dependabot PRs (vite 8.3.4, vitest 5.0.5, @types/node 26.6.5, and two
  `npm_and_yarn` multi groups) — **all major bumps, do not merge until M1c closes**.
- After M1c: triage each PR; confirm tests green; merge or close superseded duplicates.

### Physical Meta Quest Verification (Post-M1)

- Rerun the Fredrick manual emulator checklist in `docs/TEST_PLAN.md §3` on
  `https://drum.da-costa.online/?xrfps=1&debug=1`.
- Confirm seated eye-level calibration and comfortable right-hand strike reach at `0.50 m`.
- Confirm palm vs. index-finger-tip ergonomics and confirm final `strikePointMode` value.
- Fill in UNVERIFIED blanks in `TEST_PLAN.md §3` (Immersive Web Emulator `v2.0.0` hand-tracking UI steps).
