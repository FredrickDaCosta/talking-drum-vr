# Quest Test Plan (`docs/QUEST_TEST_PLAN.md`)

A ~45-minute session on a borrowed Meta Quest. It is written so that a non-technical **player** can follow it
while a **helper** reads the steps aloud and writes down the numbers.

## 0. Before you start (5 min)

- **Charge and connect:** charge the Quest to at least 50%. Connect it to Wi-Fi.
- **Hand tracking:** Quest **Settings → Movement tracking → Hand and body tracking** must be on.
- **Controllers:** put them away. This game uses hands only.
- **Seating:** use a chair **without arms** in a clear space. Sit up straight.
- **Open the game:** open **Quest Browser** and type `drum.da-costa.online/?debug=1`. Wait for the
  page, then pinch **Enter VR**.
- **The in-VR debug panel (`?debug=1`):** a dark panel with blue labels, low and to the RIGHT of the drum,
  turned toward you. Read it with the headset on; there is no need to exit VR.
  - Just glance down-right. Do not lean or stand.
  - It refreshes about 4 times a second.
  - **Mark:** touch the panel with your RIGHT index fingertip to add a **mark**. Do this right after anything
    odd, such as a missed hit, a false hit or a stutter.
    - The mark records the time, the strike count and the lesson step.
    - The `Marks` line counts up, and the newest two marks are shown in amber. The helper writes down the
      mark number and what happened.
  - **Hide or show:** touch the panel with your LEFT index fingertip. A thin blue outline stays visible so you
    can find it again.
- **Watching along:** the helper can watch the player's view by casting it (Meta Horizon phone app → Cast) and
  read the panel aloud.
- **Panel lines** (labels on the left):

  | Panel line  | Shows                                                                     |
  | ----------- | ------------------------------------------------------------------------- |
  | `FPS`       | frames per second, then frame time average / max over the last 5 s        |
  | `Frame gap` | the longest gap between frames in the last 5 s                            |
  | `Strikes`   | strike count, last strike speed (m/s) and distance from the centre `r`    |
  | `Pipeline`  | software time from frame start to sound, and audio `base` / `out` latency |
  | `Hands`     | right (`R`) and left (`L`) hand tracking state                            |
  | `Squeeze`   | left-hand squeeze 0–1, `band` L/M/H, `pitch` ratio                        |
  | `Calib`     | calibration state with the `open` and `fist` values                       |
  | `Audio`     | audio state and skipped-strike counts by reason                           |
  | `Lesson`    | lesson step, level and phrase id                                          |
  | `Marks`     | marks made so far, and the newest two                                     |

- **Capture evidence:**
  - Open the Quest menu (look at your palm and pinch, or press the Meta button) and choose **Camera**.
  - Take a **photo** (screenshot), or **Record video** for 30–60 s.
  - Files appear in the Quest **Files / Media** app. Send them to Fredrick later.
  - The exact menu names vary between Quest OS versions: UNVERIFIED.

## 1. Checks in order (write results in the table on page 2)

| #   | Check                                  | What to do                                                                                                                                   | What to look at / write down                                                                                                                                                                                                                             | If it fails, tune (in `src/app/config.ts`)                                                                         |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Hand tracking starts                   | Enter VR, then hold both hands up in front of you.                                                                                           | Hands appear within ~3 s. Panel `Hands` reads `R TRACKED   L TRACKED`. Note any "hands required" message.                                                                                                                                                | `xrInputNotice.handDetectionGraceMs`                                                                               |
| 2   | Calibration                            | Follow the panel: "open your LEFT hand wide", then "make a tight FIST".                                                                      | The lesson panel says "Calibrated". Panel `Calib` reads `done   open X   fist Y`; write down X and Y. If it says "try once more" or "default hand settings", note that.                                                                                  | `squeeze.calibrationOpenMs`, `calibrationFistMs`, `minCalibrationSeparation`, `defaultOpenCurl`, `defaultFistCurl` |
| 3   | Strike feel                            | Strike the drum 20 times with the RIGHT palm, at a normal hand-drum speed.                                                                   | Count the hits that made **no sound** (misses); **mark** each one. Panel `Strikes` shows the count and `last S m/s`; write down the count and a typical S.                                                                                               | `strike.minDownwardSpeedMetersPerSec`, `minApproachTravelMeters`, `hitRadiusMarginMeters`                          |
| 4   | False hits: slow pass and rim          | (a) Lower the hand slowly onto the drum 5 times. (b) Strike the rim/edge 5 times. (c) Rest the hand on the drum.                             | Write down how many sounds you heard for each of a, b and c (target 0); **mark** each false hit. Panel `Strikes` counts them.                                                                                                                            | `strike.minDownwardSpeedMetersPerSec`, `debounceMs`, `rearmDistanceMeters`, `hitRadiusMarginMeters`                |
| 5   | Audio                                  | Strike soft, then medium, then hard. Turn your head left and right while striking.                                                           | Does the sound feel instant (yes / slight delay / late)? Is soft-to-loud even? Does the sound come from the drum? Was the very first strike silent? Panel `Audio` should read `running` with skip counts 0; write down `Pipeline` ms and `base` / `out`. | `audio.minGain`, `gainExponent`, `minStrikeSpeedMps`, `maxStrikeSpeedMps`, `pannerRefDistanceMeters`               |
| 6   | Left-hand squeeze with a **real fist** | Hold the left hand open, then half closed, then a tight fist. Each time, strike once with the right hand.                                    | Panel `Squeeze` shows `squeeze` and `band` (L / M / H) for each; write down the values. Can you hit L, M and H **five times in a row each**? Is the fist comfortable?                                                                                    | `pitch.lowBandMax`, `highBandMin`, `bandHysteresis`; `squeeze.filter.minCutoffHz` / `beta` if jittery              |
| 7   | Pitch ladder                           | Look at the three-colour ladder left of the drum while squeezing.                                                                            | Is it readable without leaning? Does the white marker follow the squeeze smoothly? Write yes / no.                                                                                                                                                       | `pitchLadder.offsetMeters`, `heightMeters`                                                                         |
| 8   | Lesson panel, seated                   | Strike to begin and play Level 1.                                                                                                            | Can you read the panel text (word, arrows, "Your turn") without leaning? Are the Yoruba marks (ẹ ọ ṣ, á à) clear? Take a screenshot.                                                                                                                     | `lessonPanel.textPx.*`, `lessonPanel.offsetMeters`, `widthMeters`                                                  |
| 9   | Lesson pacing and sounds               | Play through Level 2.                                                                                                                        | Is the demo speed comfortable? Does the "correct" chime / "try again" tone sound gentle and quieter than the drum? Note anything that feels rushed or slow.                                                                                              | `lesson.syllableIntervalMs`, `postDemoPauseMs`, `attemptGapMs`, `feedbackMs`, `audio.cueGain`                      |
| 10  | Comfort and reach, 10 min              | Keep playing (all levels) for about 10 minutes, seated.                                                                                      | Note any shoulder, arm or neck strain, and any reach that needed leaning. Write down the total time and stars on the end screen.                                                                                                                         | `drumPlacement.distanceAheadMeters`, `belowEyeLevelMeters`, `drumTiltDeg`; `lesson.phrasesPerLevel`                |
| 11  | Frame rate and heat                    | During the 10 minutes, glance at the panel `FPS` and `Frame gap` lines now and then; **mark** any stutter. Note any "device is hot" warning. | Lowest `FPS` seen (target 72 or 90), the largest frame `max` and `Frame gap`; heat warning yes / no.                                                                                                                                                     | Report to Claude Code (no single key).                                                                             |
| 12  | Restart and exit                       | On the end screen, strike to play again. Then press the Meta button and quit, re-enter VR.                                                   | Does it restart at Level 1 without reloading? Does re-entering show the title screen again?                                                                                                                                                              | —                                                                                                                  |

<div style="page-break-after: always"></div>

## 2. Results (fill in)

Date: `______` Quest model: `______` Browser version: `______` Player / helper: `______`

| #   | Check                  | Result (pass / fail / note) | Numbers                                                       |
| --- | ---------------------- | --------------------------- | ------------------------------------------------------------- |
| 1   | Hand tracking starts   |                             | seconds to TRACKED:                                           |
| 2   | Calibration            |                             | open: \_\_\_ fist: \_\_\_ (retry / defaults?)                 |
| 3   | Strike feel            |                             | misses \_\_ / 20; strikes: \_\_; typical speed \_\_ m/s       |
| 4   | Slow pass / rim / rest |                             | slow \_\_ / 5; rim \_\_ / 5; rest \_\_                        |
| 5   | Audio                  |                             | first strike silent? \_\_; base \_\_ ms; out \_\_ ms          |
| 6   | Real fist L / M / H    |                             | squeeze L \_\_ M \_\_ H \_\_; 5-in-a-row L \_\_ M \_\_ H \_\_ |
| 7   | Pitch ladder           |                             |                                                               |
| 8   | Lesson panel seated    |                             | screenshot taken? \_\_                                        |
| 9   | Pacing and sounds      |                             |                                                               |
| 10  | Comfort / reach 10 min |                             | total time \_\_ min; stars \_\_ / 72                          |
| 11  | FPS and heat           |                             | lowest FPS \_\_; cost max \_\_ ms; heat warning? \_\_         |
| 12  | Restart / exit         |                             |                                                               |
| —   | Marks                  |                             | mark # and what happened: \_\_\_                              |

Other notes: `________________________________________________________________`
