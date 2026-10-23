# Phase 2 Plan: "Listen, then echo" (`docs/PHASE2_PLAN.md`)

> **Status:** P2a merged and deployed (#25). P2b (lesson engine and content) in review. P2c not started.
> Source: CTO design brief, 2026-10-23.

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

| Step    | Scope                                                                                                                                                              | Status       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| **P2a** | Pitch-hand squeeze, calibration, pitch mapping and L/M/H bands, pitch ladder, debug HUD                                                                            | Merged (#25) |
| **P2b** | Lesson engine and content: a typed data file validated by `content:validate`; each entry has `reviewStatus: draft \| verified`; Yoruba text with proper diacritics | In review    |
| **P2c** | Onboarding, end screen, polish                                                                                                                                     | Not started  |

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

## 4. P2b design

### 4.1 Content (`src/content/lessons.ts`)

- **Entry fields:** `id`, `level` (1..3), `text` (Yoruba, NFC), `gloss`, `syllables`, `tones` (`L`/`M`/`H`,
  one per syllable), optional `note`, and `reviewStatus` (`draft` or `verified`). The engine reads only this
  file, so words can be corrected without code changes.
- **Level 1:** five tone-only drills with no words (`M`, `H`, `L`, `H L`, `L H M`), marked `verified`
  because they contain no Yoruba.
- **Levels 2 and 3:** the brief's starter list, all `draft`.
- **Splits I am unsure about** (Fredrick or a native speaker should confirm):
  - "gb" in `igba`/`igbá`/`ìgbà` is kept as one consonant (`i-gba`).
  - The syllabic nasal: `ọrùn`/`ọ̀run` is split `ọ-rùn`/`ọ̀-run`, with "n" kept in the final syllable rather
    than counted as its own tone-bearing syllable.
  - The long vowel in `Ẹ káàbọ̀` is two strikes (`ká-à`).
  - `ilé` in `Ẹ kú ilé` is split `i-lé`, with the "i" as its own syllable.
  - All tones are copied from the brief and are unverified.
- **`content:validate`** (`src/content/validate-lessons.ts`, also run in the unit tests):
  - unique non-empty ids; level 1..3; a valid `reviewStatus`
  - tones count = syllables count; tones only L, M or H
  - NFC on text, gloss, note and syllables; non-empty gloss
  - level 1 has no text; for levels 2–3 the syllables must spell the text (spaces and hyphens ignored)
  - at least `minEntriesPerLevel` entries per level
  - Drafts are listed but never fail the build.

### 4.2 State machine (`src/game/lesson-machine.ts`, pure reducer)

`TITLE` -(strike)-> `CALIBRATION` -(squeeze calibration done, failed or skipped)-> `LEVEL_INTRO` -> `DEMO` ->
`YOUR_TURN` -> `EVALUATE` -> `FEEDBACK`. From there:

- correct → next phrase `DEMO`, or `LEVEL_COMPLETE` after the last phrase
- a miss on try 1 or 2 → retry `DEMO`
- a miss on try 3 → answer `DEMO`, then 0 stars and the next phrase

`LEVEL_COMPLETE` -> next `LEVEL_INTRO`, or `END` (total stars) -(strike)-> `TITLE`.

- **Events:** `STRIKE {band, timeMs}`, `TICK {timeMs}` (every frame) and `CALIBRATION_READY`. The reducer
  returns the same object when nothing changes, so idle frames allocate nothing. Effects (`PLAY_DEMO`) ride on
  the new state and are run once by `LessonSystem`.
- **Calibration:** the P2a calibration still starts at XR session start. While it runs, the title shows its
  prompt. A strike on the title moves to `CALIBRATION`, which passes as soon as calibration has finished
  (`?calib=0` → `skipped`).
- **Demo:** `DrumAudio.playAt(t0 + i × interval, { velocity: demoVelocityMps, pitchRatio: bandRatios[tone] })`
  on the `AudioContext` clock. The highlighted syllable and the ladder marker follow the audio clock, or
  `performance.now()` if audio is not running.
- **Your turn:** each right-hand strike records the band latched on its frame (P2a). The attempt ends at n
  strikes, or `attemptGapMs` after the last strike (incomplete = wrong). With no strike `idleReplayMs` after
  the cue, the demo replays without costing a try. Strikes during a demo or feedback still sound but are not
  scored.
- **Scoring:** band and order only (rhythm is not scored). Stars are 3/2/1 for a correct 1st/2nd/3rd try;
  after three misses, 0.
- **Leaving XR** returns to the title. The calibration is kept for the page session.
- **Controls:** the drum only. There are no UI buttons.

### 4.3 Config (`APP_CONFIG.lesson`, `APP_CONFIG.lessonPanel`)

| Value                                             | Setting                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `bandRatios`                                      | L 0.75, M 1.0, H 1.33                                                                   |
| `demoVelocityMps`                                 | 1.5 m/s (fixed demo loudness)                                                           |
| `syllableIntervalMs` / `demoLeadInMs`             | 600 / 150                                                                               |
| `postDemoPauseMs`                                 | 500                                                                                     |
| `attemptGapMs` / `idleReplayMs`                   | 4000 / 10000                                                                            |
| `maxTries`                                        | 3                                                                                       |
| `feedbackMs` / `levelIntroMs` / `levelCompleteMs` | 2000 / 2500 / 3000                                                                      |
| `phrasesPerLevel` (`minEntriesPerLevel`)          | L1 5, L2 6, L3 4                                                                        |
| `lessonPanel`                                     | 0.32 × 0.16 m, centre 0.30 m above and 0.05 m behind the drum origin; 1024 × 512 canvas |

**Pacing estimate (UNVERIFIED):** with the timings above, an all-correct session takes about 2–3 minutes. A
player who needs retries takes longer, up to about 6 minutes when every phrase needs all three tries. The
brief's 6–8 minutes therefore needs more phrases per level, or the P2c onboarding. This is a config change
once more content is verified.

### 4.4 Display

- **Panel:** a canvas-texture plane above the drum. It shows:
  - the word (bold) and the syllables
  - tone arrows (H up, M flat, L down, in the ladder colours)
  - the gloss and the state text ("Listen", "Your turn", "Try again", "Well done", "The answer")
  - the try number and stars
  - per-syllable marks after an attempt
- **Redraws:** only when the view changes.
- **Font:** UIKit's MSDF Inter has 104 glyphs (max U+00FC). It has no ẹ ọ ṣ and no combining marks, so the
  panel draws with the browser's text shaping and a bundled Noto Sans subset (OFL, ~40 KB for two weights,
  same-origin, `docs/ASSET_REGISTER.md`).
  - Verified in headless Chromium: precomposed and decomposed (NFD) forms render identically, including
    ọ́ and ọ̀ (`tests/e2e/lesson.spec.ts`).
- **Reach:** every panel corner is ≤ 0.61 m from the default eye (unit-tested; ≈0.59 m).
- **HUD (`?debug=1`):** `lesson: <phase> | level | phrase | try a/3 | last <result> | stars x/y`.
  `?lesson=<id>` starts at that phrase.

### 4.5 Verification limits

- **Verified in CI (IWER):**
  - a full lesson pass (title strike → calibration skipped → intro → scheduled demo → echo → 3 stars → next
    phrase)
  - a wrong-then-right path (2 stars)
  - zero console errors
  - the diacritics specimen
- **Not reachable in IWER:** IWER has no fist pose, so with defaults the left hand reaches only L (default)
  and M (point), and with calibration only L and H. Band H in a lesson, incomplete attempts, idle replay, the
  third-failure answer and level/END transitions are covered by the reducer unit tests.
- **UNVERIFIED (Quest only):**
  - how the demo sounds through Quest speakers, and whether the demo and highlight stay in sync
  - panel legibility and placement when seated
  - whether 600 ms per syllable and a 4 s gap feel right
  - session length with real players
- **UNVERIFIED (content):** every level-2/3 word, split and tone until a native-speaker review.
