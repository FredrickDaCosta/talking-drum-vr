# Phase 2 Plan: "Listen, then echo" (`docs/PHASE2_PLAN.md`)

> **Status:** P2a (#25), P2b (#26) and P2c (#27) are merged and deployed. P2d (in-VR debug panel for the
> Quest session) is in review.
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
| **P2b** | Lesson engine and content: a typed data file validated by `content:validate`; each entry has `reviewStatus: draft \| verified`; Yoruba text with proper diacritics | Merged (#26) |
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
- **Level 1:** tone-only drills with no words, marked `verified` because they contain no Yoruba.
  - P2b: `M`, `H`, `L`, `H L`, `L H M`.
  - P2c added three more: `L M`, `M H`, `H M L`.
- **Levels 2 and 3:** the brief's starter list. **Reviewed by Fredrick on 2026-10-23** (tones, meanings,
  diacritics and splits) and marked `verified`. **A second native-speaker review is pending.**
- **Splits (CTO: these follow standard Yoruba orthography; keep them):
  - "gb" in `igba`/`igbá`/`ìgbà` is kept as one consonant (`i-gba`).
  - The syllabic nasal: `ọrùn`/`ọ̀run` is split `ọ-rùn`/`ọ̀-run`, with "n" kept in the final syllable rather
    than counted as its own tone-bearing syllable.
  - The long vowel in `Ẹ káàbọ̀` is two strikes (`ká-à`).
  - `ilé` in `Ẹ kú ilé` is split `i-lé`, with the "i" as its own syllable.
  - The tones are from the brief and were confirmed in Fredrick's review.
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
| `postDemoPauseMs`                                 | 700 (P2c; was 500)                                                                      |
| `attemptGapMs` / `idleReplayMs`                   | 4000 / 10000                                                                            |
| `maxTries`                                        | 3                                                                                       |
| `feedbackMs` / `levelIntroMs` / `levelCompleteMs` | 2500 / 3500 / 4000 (P2c; were 2000 / 2500 / 3000)                                       |
| `phrasesPerLevel` (`minEntriesPerLevel`)          | L1 8, L2 12, L3 4 (P2c; were 5 / 6 / 4)                                                 |
| `lessonPanel`                                     | 0.32 × 0.16 m, centre 0.30 m above and 0.05 m behind the drum origin; 1024 × 512 canvas |

**Pacing:** see §5.2. The P2b estimate (2–3 min all-correct) was replaced by the P2c model.

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
- **Content:** reviewed by Fredrick on 2026-10-23. A second native-speaker review is pending.

## 5. P2c design (polish, onboarding, length, Quest test plan)

### 5.1 Onboarding and title

- **Welcome panel:** hidden for the whole XR session.
  - The welcome panel sat 1.35 m away, behind the lesson panel. `PanelSystem` now sets it (and its entity
    object) invisible on XR entry and shows it again in 2D.
  - Its in-world Exit button is also disabled, so there is no invisible hit target. Exit with the headset
    menu or the 2D page button.
  - In XR the hands-required notice now goes to the lesson title screen (`statusChannel.inputNotice`).
- **Title screen:**
  - It states the controls in plain language: "Right hand: strike the drum." and "Left hand: squeeze to change
    the pitch."
  - Then "Strike the drum to begin." in large amber text.
  - Calibration prompts and notices appear underneath.
- **Text sizes:** config constants in `APP_CONFIG.lessonPanel.textPx`. 1 canvas px is 0.3125 mm on the
  0.16 m-tall panel, so the 40 px instruction lines are ~12.5 mm (~1.3° at 0.55 m) and the 64 px prompt is
  ~20 mm.
  - The panel stays ≤ 0.61 m from the eye (unit-tested, ~0.59 m).
- **Left hand lost during "Your turn":** the panel shows "Show your left hand to change pitch". The pitch is
  already held at mid by `SqueezeSystem` (hold for 250 ms, then neutral squeeze 0.5 = band M) until the hand
  is back.

### 5.2 Session length and structure

- **Config values:** the per-level phrase counts (`lesson.phrasesPerLevel`) and the retry cap
  (`lesson.maxTries`).
- **The session now plays:**
  - L1: all 8 tone drills.
  - L2: all 12 words in data-file order, which groups the minimal sets (ọkọ ×4, igba ×3, ọrun ×2, ìyá/ìyà,
    bàbá), so each contrast is heard back to back. This is unit-tested.
  - L3: all 4 phrases.
- **Between levels:** "Level N complete" with that level's stars (4 s), then a plain "Level N" intro with the
  level name (3.5 s).
- **Estimate** (`src/game/session-estimate.ts`; a model, printed by the unit tests):

  | Pace                                                                  | Estimate    |
  | --------------------------------------------------------------------- | ----------- |
  | Normal (average tries L1 1.4, L2 1.7, L3 1.9; 5–15% reach the answer) | **5.3 min** |
  | Every phrase right first time                                         | 3.4 min     |
  | Worst case (every phrase needs all three tries and the answer)        | 9.9 min     |
  - The worst case stays under the 10-minute limit.
  - **Assumptions (UNVERIFIED):**
    - 15 s for the title and calibration
    - 1.5 s from "Your turn" to the first strike, then 0.7 s between strikes
    - the timings in §4.3

- **Content needed to reach 6–8 min at a normal pace:** about +70 s, which is roughly **6 more two-syllable
  L2 words** (≈11.5 s each at a normal pace) or **5 more three-syllable L3 phrases** (≈15 s each), or a mix
  such as 3 L2 + 2 L3.
  - No Yoruba was invented.
  - Slowing the timings further was not done: it would pad the game rather than teach.

### 5.3 End screen and restart

- **END** shows total stars (★ earned / max) and a short message by share: ≥ 80% "Excellent drumming!",
  ≥ 50% "Well played!", otherwise "Good start. Practice makes the drum talk."
- **Restart:** "Strike the drum to play again" (after a 2.5 s guard) returns the reducer to a fresh state at
  the level-1 intro.
  - There is no reload, and calibration is kept.
  - All lesson state (stars, attempt, strikes, result, demo) is reset.
  - Listeners are subscribed once in `init()` and never per session, and the system uses no timers.
  - The e2e test shows that one strike after a restart counts once.

### 5.4 Feedback sounds (`src/audio/feedback-cues.ts`)

- **"Correct":** two soft sine "bell" notes (G5 then C6, with a quiet octave partial), 0.7 s.
- **"Try again":** a low triangle tone gliding 330 → 247 Hz through a 1.2 kHz low-pass, 0.45 s.
- **Rendering:** both are rendered once at startup with `OfflineAudioContext`. They are original, with no
  samples and no downloads (ASSET_REGISTER).
- **Playback:** through the same `AudioContext`, non-spatially, at `audio.cueGain` 0.12 (below `minGain`
  0.15).
- **Loudness, verified in Chromium:** cue peak × cueGain = 0.055 vs the softest drum hit 0.168.
- **Triggers:** the reducer emits `PLAY_CUE` on entering FEEDBACK: `correct`, or `retry` for retry and answer.

### 5.5 Robustness

- **XR session ends mid-lesson:** scheduled demo voices are stopped (`DrumAudio.stopScheduled()`) and the
  lesson returns to TITLE. Re-entering plays on normally (e2e).
- **Tab hidden, or headset view `hidden`, during a demo:**
  - Demo voices stop and the reducer freezes (no TICKs).
  - On return an `INTERRUPT` event restarts the demo, or restarts the "your turn" wait, so there is no stuck
    state and no instant idle replay (unit + e2e).
- **Calibration failing twice:** a failed run shows "Calibration unclear. Let's try once more." and retries
  once (`squeeze.calibrationMaxAttempts: 2`). A second failure keeps the defaults with one message,
  "Calibration unclear, so default hand settings are used."
- **Strike during a demo:** ignored and counted in `ignoredStrikes`; it still sounds (it is a drum) but is
  never scored (unit + e2e).
- **Per-frame cost:**
  - The reducer returns the same object on idle ticks.
  - `LessonSystem.update()` allocates nothing per frame: preallocated TICK and event objects, a constant
    empty-tone array, and redraws only on change.
  - The HUD lesson line shows the rolling 1 s `cost avg / max`, which includes redraws. Headless Chromium
    shows ~0.012 ms average and 0.10 ms max at the title.
  - On Quest: UNVERIFIED.

### 5.6 Quest test plan

`docs/QUEST_TEST_PLAN.md`: a 45-minute, printable plan with an ordered checklist, what the HUD should show, the
numbers to write down, the config keys to tune, a one-page results table, and how to capture evidence.

### 5.7 Verification limits (P2c)

- **Verified in IWER e2e:**
  - the title screen in XR with the welcome panel hidden, and shown again in 2D
  - the correct chime is played and is quieter than the drum
  - a strike during a demo is ignored
  - a hidden tab stops and restarts the demo
  - three misses → answer → END → restart without a reload
  - XR exit mid-lesson → TITLE → re-enter and play
- **UNVERIFIED (Quest only):**
  - the session length with real players
  - how the cues sound through Quest speakers
  - title and panel legibility when seated
  - the Quest Browser's visibility events when the system menu opens
  - the per-frame cost on the device

## 6. P2d design (in-VR debug panel)

### 6.1 Why

The debug HUD and the FPS overlay are on the flat page, so nobody can read them with the headset on. The
borrowed-Quest session needs the key numbers inside VR.

### 6.2 Panel (`src/debug/vr-debug-panel-system.ts`)

- **Only with `?debug=1`:** `index.ts` registers `VrDebugPanelSystem` only when the flag is set, so without it
  the panel, its listeners and its window hooks do not exist (e2e).
- **Placement:** set by `APP_CONFIG.debugPanel` (`offsetMeters`, `widthMeters`, `heightMeters`,
  `visibleAtStart`).
  - It sits low and right of the drum, at drum offset `[0.30, 0.04, 0.16]`, 0.24 × 0.18 m, and is turned to
    face the head every frame.
  - The left side is avoided because the pitch ladder and the squeezing hand are there.
- **Clearances** (unit-tested): farthest point 0.57 m from the default eye (≤ 0.61 m); 10 cm clear of the
  drum body, 16 cm clear of the lesson panel, 34 cm clear of the ladder.
  - Facing error in IWER: 0.000001° (e2e asserts < 2°).
- **Content:** label and value columns in the vendored Noto subset, plain ASCII. Refreshed at
  `debugPanel.refreshHz` (4 Hz).
  - FPS, frame avg / max (5 s), max frame gap (5 s)
  - strikes, last speed and radial distance
  - pipeline ms with audio base / out latency
  - R / L tracking, squeeze, band, pitch ratio
  - calibration with open / fist values
  - audio state and skip counts
  - lesson step, level and phrase id
  - marks
- **Allocation:**
  - Every frame, samples go into a preallocated snapshot and the frame times into a typed-array ring
    (`FrameStatsWindow`); fingertip poses are read with `XRFrame.fillPoses` into a preallocated buffer.
  - Strings are built only at 4 Hz.

- **Refresh cost fix (after #28):**
  - The first version redrew a 1024 × 768 canvas and rebuilt its mipmaps on every 4 Hz refresh. In CI's
    software renderer that caused frame spikes of about 230 ms, which broke scripted strikes in the lesson
    e2e tests on main.
  - The canvas is now 640 × 480. That is about the Quest 3 pixel density for 0.24 m at 0.55 m, and the
    physical text size is unchanged.
  - Mipmaps are off.
  - Measured locally: frames that redraw the panel went from +17–35 ms over other frames to no measurable
    difference.

### 6.3 Hands-only controls (`src/debug/panel-touch.ts`)

- **Touch:** an index fingertip inside the panel outline and within `touchDepthMeters` (3 cm) of its plane.
  - It is edge-triggered: one event per entry.
  - It re-arms only after the finger has been out for `touchRearmMs` (600 ms), so a resting finger or edge
    jitter cannot repeat it.
- **RIGHT index touch = mark:** a timestamped note in a ring buffer (`MarkLog`, `markCapacity` 32). It
  records the time since load, the strike count, the last strike speed and radial distance, the lesson step
  and the phrase id.
  - The panel shows the count and the newest two.
  - `window.__talkingDrumDebugPanel.marks()` returns them for later correlation.
- **LEFT index touch = hide / show.** A thin outline stays visible.
  - The left hand has to reach across the body to the right-side panel, so an accidental toggle is unlikely.
- **Keyboard** (desktop and emulator): `debugPanel.toggleKey` (Backquote) and `markKey` (M).
- **Is the mark overkill?** No, I kept it. It is about 90 lines (ring buffer, touch edge, one line of text).
  Without it, "that hit felt wrong" cannot be tied to the strike count and time afterwards.
  - The lightest alternative would be a bare counter with no context.

### 6.4 Content additions (prepared, not added)

- **No code change needed:** `lesson.phrasesPerLevel` is now `'all'` per level, so new entries in
  `src/content/lessons.ts` play with no code or config change.
- **What's needed:** see `docs/CONTENT_ADDITIONS.md` for the entry template, empty slots and the counts.
  - 6 min needs +4 two-syllable L2 words or +3 three-syllable L3 phrases.
  - +4 L2 and +3 L3 gives ≈6.9 min.
  - With that content the all-misses worst case is ≈12.7 min, over the 10-minute limit; this is flagged in
    that file.

### 6.5 Verification limits (P2d)

- **Verified in IWER e2e:**
  - the panel is absent without `?debug=1`
  - with it: it refreshes at ~4 Hz, shows both hands TRACKED, audio running and the lesson step, and the
    strike count follows a scripted strike
  - a right fingertip touch adds one mark, a left touch hides the panel, and the keyboard shortcuts work
  - zero console errors
- **UNVERIFIED (Quest only):**
  - legibility of the 24 px text on the 640 × 480 canvas (font size ~9 mm on the panel) at ~0.55 m
  - whether the low-right position is comfortable to glance at
  - fingertip touch reliability with real hand tracking (in IWER the fingertip is placed exactly)
  - Quest Browser `XRFrame.fillPoses` support for the touch check: if it is missing, touches do nothing but
    the panel still displays
