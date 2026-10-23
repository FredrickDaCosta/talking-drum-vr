# Phase 2 Plan: "Listen, then echo" (`docs/PHASE2_PLAN.md`)

> **Status:** P2a (squeeze and pitch) in review. P2b and P2c not started. Source: CTO design brief, 2026-10-23.

## 1. Game

- **Loop:** the drum "speaks" a short Yoruba word or phrase as a sequence of pitches (one strike = one
  syllable). The player echoes it.
- **Controls (hands only, seated):** the right hand strikes (existing detector). The left hand squeezes to
  set the pitch, like pressing a talking drum's cords: open hand = low, middle squeeze = mid, tight
  fist = high.
- **The drum is the only button:**
  - Strike once to start.
  - A correct echo advances automatically.
  - After 3 failed tries, the answer is shown and the game advances.
  - There are no UI buttons to poke.
- **Live feedback:** a three-rung pitch ladder next to the drum shows the current squeeze level.
- **Levels (~6–8 min total; contest limit 10 min):**
  - L1: single tones (feel and calibration)
  - L2: tone-contrast words
  - L3: greetings and short phrases
- **Scoring per syllable:** correct tone band and correct order. Rhythm is lenient. Each phrase scores 1–3 stars.

## 2. Steps

| Step    | Scope                                                                                                                                                              | Status      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| **P2a** | Pitch-hand squeeze, calibration, pitch mapping and L/M/H bands, pitch ladder, debug HUD                                                                            | In review   |
| **P2b** | Lesson engine and content: a typed data file validated by `content:validate`; each entry has `reviewStatus: draft \| verified`; Yoruba text with proper diacritics | Not started |
| **P2c** | Onboarding, end screen, polish                                                                                                                                     | Not started |

- **Content:** Fredrick supplies it (starter list in review). **No Yoruba content is invented in code.**
- **Tuning:** a real-Quest session is planned around Nov 1. Every threshold below is a config value
  (`src/app/config.ts`: `squeeze`, `pitch`, `pitchLadder`).

## 3. P2a design

### 3.1 Squeeze metric (`src/input/hand-squeeze.ts`)

- **Per-finger curl:** for index, middle, ring and pinky, the distance from the tip to that finger's own
  knuckle (`*-phalanx-proximal`), divided by the palm length (wrist → middle-finger knuckle).
- **Hand curl:** the mean over the fingers with valid joints. Squeeze = (open − curl) / (open − fist),
  clamped to 0..1.

**Why this differs from the brief's suggestion** (tip-to-wrist normalised by wrist → middle-finger _metacarpal_):

- **Normaliser:** in WebXR the `*-metacarpal` joint sits at the base of the metacarpal bone, near the wrist.
  - Wrist → middle metacarpal is only ~3.5 cm, which amplifies jitter, and it varies 8% across the IWER
    reference poses (0.0346–0.0376 m).
  - Wrist → middle knuckle is ~9.6 cm and identical across those poses (0.0957 m). That makes it a rigid,
    low-noise hand-size normaliser.
- **Tip → own knuckle** measures finger flexion only, so wrist bend and palm pose don't leak into squeeze.
- **The thumb is excluded:** its position in a fist varies a lot between people.

**Robustness:**

- **Usable frame:** palm length plausible (5–16 cm) and at least 2 fingers valid. Otherwise the frame is
  "missing".
- **Missing frames:** the last squeeze is held for 250 ms (`HELD`), then falls back to neutral 0.5 (mid
  pitch) and is flagged `LOST`.
- **Smoothing:** the existing One Euro filter (min cutoff 2 Hz, beta 0.6).
- **Allocation:** none per frame. Joints are read with `XRFrame.fillPoses` into a preallocated buffer, with
  a `getJointPose` fallback.

### 3.2 Calibration (`src/input/squeeze-calibration.ts`)

- **When:** at XR session start, once the pitch hand is tracked.
- **Steps:** "open your LEFT hand wide" (2 s), then "make a tight FIST" (2 s), shown in the existing status
  line and the in-world welcome-panel text.
- **Capture:** the median curl of each step after a 0.5 s settle. The median rejects outliers.
- **Sanity checks:**
  - at least 8 samples per step (a floor; ~10 fps headless gives ~15, a 72 Hz headset ~108)
  - values in 0.05–1.6 palm lengths
  - open − fist ≥ 0.2
- **Failure, or `?calib=0`:** defaults are used (open 0.95, fist 0.35) and a short message is shown.
- **Repeats:** a successful calibration is kept for the page session.

### 3.3 Pitch (`src/game/pitch-mapping.ts`)

- **Continuous pitch:** `pitchRatio` uses log interpolation 0.75 → 1.0 (squeeze 0 → 0.5) and 1.0 → 1.33
  (0.5 → 1), so equal squeeze steps give equal musical intervals.
- **Bands:** L < 0.33 ≤ M ≤ 0.67 < H, with hysteresis width 0.04. Moving up needs threshold + 0.02, moving
  down needs threshold − 0.02.
- **Strike latching:** `SqueezeSystem` runs before `StrikeSystem` each frame. On a strike, `DrumAudioSystem`
  latches that frame's squeeze, band and pitch, and calls `DrumAudio.play({ velocity, pitchRatio })`.
- **Strikes:** the pitch hand never strikes (`allowSecondaryHand: false`). `?hand=left` swaps the hands.

### 3.4 Pitch ladder and HUD

- **Ladder:** a rail, three band-coloured rungs (lit = current band) and a marker at the live squeeze.
  - Placed 0.20 m left of the drum, from 0.05 m up, 0.18 m tall.
  - Within 0.61 m of the default eye (unit-tested): bottom 0.55 m, top 0.48 m.
  - Built from basic geometry, so there are no downloads.
- **`?debug=1` HUD line:** `pitch hand(left): <TRACKED|HELD|LOST> | squeeze | curl | band | pitch | calib … | last strike …`.

### 3.5 Verification limits

- **CI (IWER) covers:** IWER's `default` and `point` hand poses through real WebXR joint poses, the band
  mapping, latching, and the full calibration flow.
- **IWER has no fist pose.** I expect the emulator's Pose selector to offer the same presets (UNVERIFIED),
  so a true fist is likely testable only on a headset.
- **UNVERIFIED until a Quest session:** real hand-tracking curl ranges, comfort, latency, and whether the
  defaults and thresholds feel right.
