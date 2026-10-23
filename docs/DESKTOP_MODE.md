# Desktop Play Mode (`docs/DESKTOP_MODE.md`)

## What it is

Visitors without a headset play **the same lesson** (the same reducer, content, demos, scoring and panels)
with mouse, keyboard or touch, so the link is never a dead end. **VR stays the primary mode.**

| Browser                                    | Starts in    | What it shows                                                                              |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------ |
| WebXR `immersive-vr` supported (Quest)     | VR mode      | **Enter VR** first and prominent, plus a small secondary **Play without a headset** button |
| No `navigator.xr`, or immersive-vr missing | Desktop mode | Desktop controls; Enter VR stays visible as a smaller secondary button                     |
| Any browser with `?mode=desktop`           | Desktop mode | Forced, for testing                                                                        |

## Controls

- **Strike (the right hand):**
  - Click or tap the drum head. The click must be inside the projected outline of the top head.
  - Space or Enter also strikes, for keyboard users.
  - Shift makes it a soft strike.
  - Velocity is `desktop.strikeVelocityMps` (1.6 m/s), or `softStrikeVelocityMps` (0.6) for a soft one.
  - Velocity from mouse speed was not added: a click has no reliable speed, and a fixed velocity is
    predictable.
- **Pitch (the left hand):**
  - The on-screen **Low / Mid / High** buttons (`aria-pressed`, ≥ 44 px tap targets), or the keys
    **1 / 2 / 3** or **Q / W / E**.
  - The pitch ladder in the scene shows the chosen band.
  - The band is **latched at the strike**, exactly as in VR (`latchPitchForStrike`), and plays at the
    demo's ratio for that band (L 0.75, M 1.0, H 1.33).
- **Calibration:** skipped, because there is no hand to measure. A calibration already finished in VR is kept.

## How it works (`src/desktop/`)

- **`DesktopInput`:** an adapter, not faked joints. It writes the selected band into the shared
  pitch-hand state and builds the same `InternalStrikeEvent` a hand strike produces.
- **Strike delivery:** `StrikeSystem.emitExternalStrike()` counts the strike and delivers it to the same
  listeners as a hand strike (DrumAudioSystem, then LessonSystem).
- **`DesktopModeSystem`:** detects the mode, handles pointer and keyboard input, and builds the HTML
  overlay (`desktop-overlay.ts`; styles in `index.html`).
  - **The XR path is unchanged:** desktop input is live only in desktop mode **and** outside an XR
    session. Entering VR from desktop play turns it off, and the headset's squeeze takes over. Leaving
    VR turns it back on.
- **Audio:** the first click or key also unlocks audio (`audio-unlock.ts`). If the context is still
  resuming, that first strike waits for `DrumAudio.whenRunning()`, so it is heard rather than skipped.
  Demos use the same `playAt` scheduling.
- **Camera:** the same fixed seated camera as the emulator (no orbit).
  - On narrow (portrait) screens, desktop mode widens the vertical FOV so the horizontal view matches a
    16:9 screen. It is restored whenever desktop play is off, so XR projection is never touched.
  - IWSDK already keeps the canvas size in step with the window, and no resize code was added. That
    avoids three.js's "Can't change size while VR device is presenting" warning, which only appears if
    `setSize` is called during XR.
- **Welcome panel:** hidden during desktop play. The lesson panel's title screen and the overlay carry
  the instructions.

## How to test

- **On a laptop:** open `https://drum.da-costa.online/` in any desktop browser without a headset. Or use
  `?mode=desktop` in Chrome with the Immersive Web Emulator.
- **Expected:**
  - The overlay reads "Click the drum to strike. Choose Low, Mid or High to change the pitch."
  - Click the drum to begin and listen to the demo. Choose the pitch, then click the drum once per
    syllable.
- **On a phone:** tap the drum and the buttons.
- **Automated:** `tests/e2e/desktop.spec.ts`
  - one full phrase with clicks and pitch buttons
  - keyboard
  - a 390 × 844 phone viewport with tap-target sizes
  - the VR-capable path (offer button, `?mode=desktop`)
- **Unit tests:** `tests/unit/desktop.test.ts`.

## Limits (UNVERIFIED)

- **Real phones and tablets:** not tested. That covers Safari and Android Chrome, touch latency, the
  audio unlock on iOS, and lesson panel legibility on a small screen (the 3D panel is small in portrait).
- **Audio latency:** the audio-to-click latency on desktop browsers has not been measured.
- **Quest Browser:** "Play without a headset" there would play on the flat browser window; not tried.
