# Project Status (`docs/PROJECT_STATUS.md`)

> **Purpose:** Context-reset recovery file. Updated at the end of every stage.
> A new context can read this file and pick up exactly where work left off.

---

## Current Stage

**Phase 2, step P2b (lesson engine and content): IN REVIEW** on branch `feat/p2b-lessons`. The PR is open;
do NOT merge until the CTO approves. P2a was ACCEPTED and merged in #25 (`2487027`), then deployed (Deploy run
40013067378, live smoke 7 passed). M1 is closed (tag `m1` on `8484a50`, pushed by Fredrick). The audio
diagnostics and safe resume work (PR #24, `3e96474`) is merged and deployed. The plan is in
`docs/PHASE2_PLAN.md`. Implementation was handed from Antigravity to Claude Code (cloud session); the
CTO/PM writes the task prompts and Fredrick relays them.

- **M1a:** Merged in PR #12 (`f1245d5`) — local XR hand profiles, 3D One Euro filter, pure
  `StrikeDetector`.
- **M1b:** Merged in PR #13 (`acf8a8f`) and deployed (Deploy run 39779468627, live smoke 5/5).
  Merge ACCEPTED by CTO. **Emulator-VERIFIED by Fredrick 2026-10-22** (`docs/TEST_PLAN.md §3.1`):
  hand mode via the toolbar input-mode icon, `TRACKED`, 21 strikes, slow passes ignored, no red errors.
  Rim-miss was not observed by hand. Real-Quest feel, thresholds and latency are UNVERIFIED.
- **Security triage:** Closed. Fixes merged and deployed in #14 (`754ab59`), #15 (`94efaf2`) and #16 (`d26bc0b`).
  `npm audit`: 0 vulnerabilities. Follow-up #22 (`a72b74b`) ignores eslint/@eslint/js/typescript majors, and
  #17–#19 are closed unmerged. See `docs/SECURITY_TRIAGE.md` §7–§8.
- **M1c:** CTO ACCEPTED and merged in PR #21 (`3ae807c`). Deployed (Deploy run 39961741328, live smoke 5/5).
  Flake closure: the IWER hand-strike test passed 30/30 consecutively with retries off (CI keeps `retries: 1`).
- **M1:** Closed with the annotated tag `m1` and a CHANGELOG `[m1]` entry.

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
| Merge rules          | Claude Code may merge, deploy and verify only work the CTO has approved in writing, and only with CI + CodeQL green; unapproved work → open PR and stop. Never merge Dependabot PRs #3–#7 | Explicit written approval gate per task                                                          |
| Strike point default | `strikePointMode: 'palm'` (midpoint of wrist + middle-finger-metacarpal)                                                                                                                  | Index-finger-tip available as config option; final choice after physical Quest testing           |
| Drum axis convention | Long axis `+Y` in asset-local space; world tilt via scene `rotationDeg: [30, 0, 0]` (not baked in asset)                                                                                  | Single source of truth; `drum-orientation.test.ts` enforces no baked rotation                    |

---

## Open Tasks

### M1c (merged in PR #21 `3ae807c`; done)

- [x] `DrumAudio` (`src/audio/drum-audio.ts`): one lazy `AudioContext`, unlocked in the Enter VR click and on
      the first page gesture (`src/audio/audio-unlock.ts`). The procedural _gángan_ placeholder is rendered via
      `OfflineAudioContext` (`src/audio/gangan-placeholder.ts`). `play({ velocity, pitchRatio = 1 })` maps
      0.30–3.0 m/s to v, then g = 0.15 + 0.85·v^0.75. pitchRatio drives playbackRate (clamped 0.5–2). HRTF
      panner at the drum head, listener on the player head, pooled voice gains. Wired via `DrumAudioSystem` →
      `StrikeSystem.onStrike`.
- [x] Latency probe (`?debug=1`, HUD line 2): "software + audio buffer estimate (not tracking / end-to-end
      latency)", showing the pipeline (StrikeSystem frame entry → play()), base/out latency or `n/a`, audio
      state and voice count.
- [x] Loading banner `#app-loading-banner`: static HTML, removed when startup resolves, plain error message on
      failure (`src/app/loading-banner.ts`).
- [x] Controller-only / no-hands XR notice after a 3 s grace period with no tracked hand
      (`src/platform/xr-input-notice.ts`, `PanelSystem`).
- [x] Player-rig transform safeguard: hand poses (reference space = rig-local) are mapped by
      `inverse(drumWorld) × playerWorld` (`src/input/reference-space.ts`). No-op at an identity rig. Inferred
      scope: the CTO prompt was truncated.
- [x] ASSET_REGISTER entry for the procedural placeholder.
- [x] E2E hand-strike flake root-caused: headless SwiftShader frames of 180–200 ms make the scripted strike
      slower than 0.30 m/s. The test now retries only measured slow-frame attempts.
- [x] M1 close: tag `m1` and the CHANGELOG `[m1]` release entry.
- Real-Quest audio latency, loudness feel and HRTF placement: **UNVERIFIED**.

### Dependabot / security (see `docs/SECURITY_TRIAGE.md` §7)

- Done: sharp `0.35.5` (#14), vitest `^4.1.12` (#15), `dependabot.yml` ignore-majors (version updates only)
  plus minor/patch groups (#16). #3–#7 closed, none merged. `npm audit`: 0 vulnerabilities.
- [ ] Fredrick: read the GitHub Security tab and confirm the open Dependabot alert count (the API returns 403 to the agent).
- [ ] CTO decision: new Dependabot major PRs #17 (`@eslint/js` 10), #18 (`typescript` 7), #19 (`eslint` 10).
      Close them, or add ignore rules? Do not merge without approval.
- Note: Dependabot does not check the aliased `three` (`npm:super-three`), so three updates are manual.
- E2E flake: root-caused and handled in M1c (see the M1c section above).

### Phase 2 (see `docs/PHASE2_PLAN.md`)

- [x] P2a merged (#25, `2487027`) and deployed: pitch-hand squeeze (tip → own-knuckle curl / palm length), guided open/fist
      calibration (`?calib=0` skips it), log pitch mapping 0.75–1.0–1.33, L/M/H bands with hysteresis,
      strike-frame latch into `DrumAudio.play({ velocity, pitchRatio })`, pitch ladder, debug HUD pitch line.
- [ ] Fredrick: P2a emulator checklist (`docs/TEST_PLAN.md §3.3`) after deploy.
- [x] P2b in review (`feat/p2b-lessons`): lesson data and validation, a pure lesson reducer and
      `LessonSystem`, `DrumAudio.playAt` demos on the audio clock, the canvas lesson panel with a bundled Noto
      Sans subset for Yoruba diacritics, a HUD lesson line, and `?lesson=<id>`. See `docs/PHASE2_PLAN.md §4`.
- [ ] Fredrick: P2b emulator checklist (`docs/TEST_PLAN.md §3.4`) after deploy.
- [ ] Fredrick / native speaker: review the 16 draft L2/L3 entries (splits flagged in `PHASE2_PLAN.md §4.1`)
      and set `reviewStatus: 'verified'`.
- [ ] Pacing: an all-correct session is about 2–3 min (UNVERIFIED). Raise `phrasesPerLevel` once more content
      is verified, to reach the 6–8 min target.
- [ ] P2c: onboarding, end screen, polish.
- [ ] Real-Quest tuning session (~Nov 1): squeeze defaults, band thresholds, filter, ladder placement.

### Open Items After M1 (owner in brackets)

- [ ] [Fredrick] Emulator audio check: the M1c checklist in `docs/TEST_PLAN.md §3.2` on the live site.
- [ ] [Fredrick] Real-Quest session covering every UNVERIFIED item: hand-tracking feel, strike thresholds,
      palm vs fingertip, seated reach at 0.50 m, audible quality and loudness curve, HRTF placement,
      audio and end-to-end latency, AudioContext state at the first strike in Quest Browser, 72/90 FPS thermals.
- [ ] [Fredrick] Record his own drum sample to replace the procedural placeholder
      (`DrumAudio.setBuffer()` / `decodeSample()`), and update `docs/ASSET_REGISTER.md`.
- [ ] [Fredrick / native speaker] Native-speaker review of all Yoruba content (tones, words, diacritics)
      before submission.
- [ ] [Fredrick] Eligibility email to Meta for the VR Start Developer Competition 2026.
- [ ] [Fredrick] Read the GitHub Security tab for the real Dependabot alert count (the API returns 403 to the agent).
- [ ] [CTO] Phase 2 design brief.

### Physical Meta Quest Verification (Post-M1)

- Rerun the Fredrick manual emulator checklist in `docs/TEST_PLAN.md §3` on
  `https://drum.da-costa.online/?xrfps=1&debug=1`.
- Confirm seated eye-level calibration and comfortable right-hand strike reach at `0.50 m`.
- Confirm palm vs. index-finger-tip ergonomics and confirm final `strikePointMode` value.
- Fill in UNVERIFIED blanks in `TEST_PLAN.md §3` (Immersive Web Emulator `v2.0.0` hand-tracking UI steps).
