# Quest Test Plan (`docs/QUEST_TEST_PLAN.md`)

A ~45-minute session on a borrowed Meta Quest. It is written so that a non-technical **player** can follow it
while a **helper** reads the steps aloud and writes down the numbers.

## 0. Before you start (5 min)

- **Charge and connect:** charge the Quest to at least 50%. Connect it to Wi-Fi.
- **Hand tracking:** Quest **Settings → Movement tracking → Hand and body tracking** must be on.
- **Controllers:** put them away. This game uses hands only.
- **Seating:** use a chair **without arms** in a clear space. Sit up straight.
- **Open the game:** open **Quest Browser** and type `drum.da-costa.online/?debug=1&xrfps=1`. Wait for the
  page, then pinch **Enter VR**.
- **Reading the debug HUD:** the HUD (grey text) and the FPS overlay (`xrfps=1`) sit on the **flat page**,
  not inside VR. The cast view shows only the VR view.
  - To read the HUD, the player stays seated and presses the **Meta button**, or exits VR, and reads the
    page.
  - The counts are kept. The lesson goes back to its title screen, but the calibration is kept.
  - Then pinch **Enter VR** again.
  - Do this only between checks. Never stand up or walk with the headset half on.
- **Watching along:** the helper can watch the player's view by casting it (Meta Horizon phone app → Cast).
- **Frame rate:** our overlays are on the flat page, so they cannot show the VR frame rate while you play.
  - If the borrowed Quest has a performance overlay enabled (developer tools), use it.
  - Otherwise note any visible stutter.
  - Which tools a borrowed device allows is UNVERIFIED.
- **Capture evidence:**
  - Open the Quest menu (look at your palm and pinch, or press the Meta button) and choose **Camera**.
  - Take a **photo** (screenshot), or **Record video** for 30–60 s.
  - Files appear in the Quest **Files / Media** app. Send them to Fredrick later.
  - The exact menu names vary between Quest OS versions: UNVERIFIED.

## 1. Checks in order (write results in the table on page 2)

| #   | Check                                  | What to do                                                                                                                                                                                                                           | What to look at / write down                                                                                                                                                                                     | If it fails, tune (in `src/app/config.ts`)                                                                         |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Hand tracking starts                   | Enter VR, then hold both hands up in front of you.                                                                                                                                                                                   | Hands appear within ~3 s. The HUD line 1 shows `hand(right): TRACKED` and line 3 shows `pitch hand(left): TRACKED`. Note any "hands required" message.                                                           | `xrInputNotice.handDetectionGraceMs`                                                                               |
| 2   | Calibration                            | Follow the panel: "open your LEFT hand wide", then "make a tight FIST".                                                                                                                                                              | The panel says "Calibrated". HUD line 3 shows `calib done (open X / fist Y)`; write down X and Y. If it says "try once more" or "default hand settings", note that.                                              | `squeeze.calibrationOpenMs`, `calibrationFistMs`, `minCalibrationSeparation`, `defaultOpenCurl`, `defaultFistCurl` |
| 3   | Strike feel                            | Strike the drum 20 times with the RIGHT palm, at a normal hand-drum speed.                                                                                                                                                           | Count the hits that made **no sound** (misses). HUD line 1 shows `strikes: N` and `speed: S m/s`; write down N and a typical S.                                                                                  | `strike.minDownwardSpeedMetersPerSec`, `minApproachTravelMeters`, `hitRadiusMarginMeters`                          |
| 4   | False hits: slow pass and rim          | (a) Lower the hand slowly onto the drum 5 times. (b) Strike the rim/edge 5 times. (c) Rest the hand on the drum.                                                                                                                     | Write down how many sounds you heard for each of a, b and c. The target is 0.                                                                                                                                    | `strike.minDownwardSpeedMetersPerSec`, `debounceMs`, `rearmDistanceMeters`, `hitRadiusMarginMeters`                |
| 5   | Audio                                  | Strike soft, then medium, then hard. Turn your head left and right while striking.                                                                                                                                                   | Does the sound feel instant (yes / slight delay / late)? Is soft-to-loud even? Does the sound come from the drum? Was the very first strike silent? Write down HUD line 2 `audio running` and `base` / `out` ms. | `audio.minGain`, `gainExponent`, `minStrikeSpeedMps`, `maxStrikeSpeedMps`, `pannerRefDistanceMeters`               |
| 6   | Left-hand squeeze with a **real fist** | Hold the left hand open, then half closed, then a tight fist. Each time, strike once with the right hand.                                                                                                                            | HUD line 3 shows `squeeze` and `band` (L / M / H) for each; write down the values. Can you hit L, M and H **five times in a row each**? Is the fist comfortable?                                                 | `pitch.lowBandMax`, `highBandMin`, `bandHysteresis`; `squeeze.filter.minCutoffHz` / `beta` if jittery              |
| 7   | Pitch ladder                           | Look at the three-colour ladder left of the drum while squeezing.                                                                                                                                                                    | Is it readable without leaning? Does the white marker follow the squeeze smoothly? Write yes / no.                                                                                                               | `pitchLadder.offsetMeters`, `heightMeters`                                                                         |
| 8   | Lesson panel, seated                   | Strike to begin and play Level 1.                                                                                                                                                                                                    | Can you read the panel text (word, arrows, "Your turn") without leaning? Are the Yoruba marks (ẹ ọ ṣ, á à) clear? Take a screenshot.                                                                             | `lessonPanel.textPx.*`, `lessonPanel.offsetMeters`, `widthMeters`                                                  |
| 9   | Lesson pacing and sounds               | Play through Level 2.                                                                                                                                                                                                                | Is the demo speed comfortable? Does the "correct" chime / "try again" tone sound gentle and quieter than the drum? Note anything that feels rushed or slow.                                                      | `lesson.syllableIntervalMs`, `postDemoPauseMs`, `attemptGapMs`, `feedbackMs`, `audio.cueGain`                      |
| 10  | Comfort and reach, 10 min              | Keep playing (all levels) for about 10 minutes, seated.                                                                                                                                                                              | Note any shoulder, arm or neck strain, and any reach that needed leaning. Write down the total time and stars on the end screen.                                                                                 | `drumPlacement.distanceAheadMeters`, `belowEyeLevelMeters`, `drumTiltDeg`; `lesson.phrasesPerLevel`                |
| 11  | Frame rate and heat                    | During the 10 minutes, note any stutter and any "device is hot" warnings. Afterwards, exit VR and read the HUD lesson line. (The `xrfps` overlay counts page frames, so after exiting it shows the flat-page rate, not the VR rate.) | Stutter yes / no; heat warning yes / no; the lesson line `cost avg / max ms`. A true in-VR FPS number needs a device performance overlay (see above).                                                            | Report to Claude Code (no single key).                                                                             |
| 12  | Restart and exit                       | On the end screen, strike to play again. Then press the Meta button and quit, re-enter VR.                                                                                                                                           | Does it restart at Level 1 without reloading? Does re-entering show the title screen again?                                                                                                                      | —                                                                                                                  |

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

Other notes: `________________________________________________________________`
