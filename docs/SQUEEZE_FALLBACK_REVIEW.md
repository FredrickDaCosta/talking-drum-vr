# Squeeze Fallback Review (`docs/SQUEEZE_FALLBACK_REVIEW.md`)

> **Status: review only.** This is a proposal for the CTO to decide on — nothing here is
> implemented. If approved, it becomes its own task.

Left-hand squeeze → pitch is the part of the game with the least real-headset data: calibration and
band mapping are tuned against synthetic IWER fixtures, not real hand tracking. This reviews how
they could fail on a real Quest, and proposes the cheapest fallback that keeps the game playable if
three clean bands (`L` / `M` / `H`) turn out not to be reliably achievable.

## 1. How calibration and the squeeze can fail on real tracking

`SqueezeCalibration` (`src/input/squeeze-calibration.ts`) captures the median curl of an "open hand"
step and a "fist" step, each after a settle period, then checks the result against
`APP_CONFIG.squeeze`'s plausibility bounds before accepting it. `HandSqueeze`
(`src/input/hand-squeeze.ts`) computes the frame's raw curl from live joint poses. Three concrete
failure modes:

### 1.1 Partial curl noise

Real hand tracking loses confidence per-finger, not all-or-nothing: a Quest can report three solid
fingers and one jittery one, especially at the frame's edge or in poor lighting. `rawCurl` is a mean
across `index..pinky`, so one noisy finger pulls the whole frame's value around even though the
other three are fine. `minValidFingers` already drops a frame below that count rather than averaging
garbage, but a frame that clears the threshold with 1-2 noisy fingers can still land the median
sample in the wrong place during the open/fist capture window, which affects `calibratedOpenCurl` /
`calibrationFistCurl` for the whole session (calibration runs once, not continuously).

**Symptom on a real headset:** calibration reports `done`, but the captured values sit closer
together than the open-hand / fist gesture actually was, compressing the live squeeze range and
making one or more bands hard to reach even though the player believes they're squeezing fully.

### 1.2 Hand-size and gesture-habit differences

`rawCurl` is normalised to palm length (tip-to-own-knuckle divided by wrist-to-middle-knuckle), which
already controls for hand _size_. It does not control for _gesture habit_: some players' natural
"open hand" is a loose, slightly curled rest pose rather than a fully splayed hand; some players'
"fist" is a light curl rather than a tight squeeze (comfort, hand strength, unfamiliarity with the
prompt). `minCalibrationSeparation` rejects a run where open and fist are too close together and
retries once, then falls back to the config defaults — but a run that passes the separation check
with a genuinely narrow personal range (rather than a bad frame) still leaves that player with a
compressed, less distinguishable live band-to-pitch mapping than the fixture data assumed.

**Symptom on a real headset:** calibration succeeds, but `M` (the middle band, bounded by
`lowBandMax` and `highBandMin` with hysteresis on both sides) is proportionally narrower for a
small-range player, making it easy to overshoot from `L` straight to `H` or back without resting in
`M`.

### 1.3 One hand untracked

`StrikeSystem` requires a tracked right hand to strike at all; `HandSqueeze`/`pitchHand` similarly
need a tracked left hand to report a real squeeze (`tracking` goes to `LOST`, holding the last
squeeze for `missingHoldMs` before falling back to `neutralSqueeze`, per
`SqueezeConfig.missingHoldMs`/`neutralSqueeze`). On a real Quest, losing one hand mid-gesture (it
leaves the tracking volume, self-occludes behind the body or the drum, or the headset briefly loses
tracking during fast motion) is common enough to be routine, not exceptional — more so for the
left/squeeze hand, which is held in a static, often lower, less-forward pose than the actively
striking right hand.

**Symptom on a real headset:** the pitch silently freezes at the last squeeze value (by design, for
`missingHoldMs`) and then snaps to a fixed mid pitch; a player who doesn't notice their hand left the
tracking volume gets a result that doesn't match the pitch they thought they chose, with no
indication why.

## 2. Proposed fallback (cheapest that keeps the game playable)

All three failure modes share a root cause: the game assumes a _continuous, three-way-distinguishable_
squeeze signal, and real tracking's guarantee is weaker than that. The cheapest fallback that keeps
the game playable without that guarantee is to **widen the hysteresis band thresholds adaptively from
the calibration range itself, and degrade from 3 bands to 2 (or, in the worst case, flag squeeze as
unavailable and fall back to a fixed mid pitch) rather than from 3 bands to a silently-wrong 3**:

1. **Derive the band thresholds from the captured calibration range, not just the squeeze value.**
   Today `lowBandMax`/`highBandMin` are fixed, global constants; `SqueezeCalibration` already
   captures `(openCurl, fistCurl)` per player. If the _post-calibration_ range (`openCurl - fistCurl`,
   already compared against `minCalibrationSeparation` to decide pass/fail) is on the narrow side —
   closer to the rejection threshold than the fixture-tuned middle of the plausible range — place
   `lowBandMax`/`highBandMin` (and their hysteresis) proportionally further apart as a fraction of
   that narrower range, rather than using the same fixed split for every player. This is the cheapest
   option: no new UI, no new state, a per-session scalar derived from data already captured.
2. **If the range is narrow enough that a reliable `M` band isn't achievable at all** (a threshold
   to tune after real-headset data, not guessed here), **drop to two bands (`L`/`H`) for pitch**,
   keeping the existing lesson content's tone targets mapped to whichever of `L`/`M`/`H` is closest
   (`M` targets round to whichever of `L`/`H` the player's own calibrated midpoint sits nearer). This
   keeps the lesson playable and the tone _contrasts_ (low vs. high) intact, at the cost of losing the
   mid-tone distinction for that session only — better than three bands that are unreliable to hit.
3. **If the squeeze hand is untracked for longer than a short grace window (longer than
   `missingHoldMs`, which is meant for brief tracking drops, not a genuinely lost hand)**, surface
   this to the player explicitly (a status line, similar to the existing controller-only /
   no-hands notice) rather than silently freezing on the last value — the player should know pitch is
   currently fixed/unavailable, not guess it from unexpected mid-pitch output.

None of this is implemented; it's sized here so the CTO can decide whether it's worth a dedicated
task, and at what real-headset-data threshold (2) should trigger.
