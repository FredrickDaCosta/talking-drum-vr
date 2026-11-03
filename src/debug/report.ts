import { APP_CONFIG } from '../app/config.js';
import type { DebugMark } from './mark-log.js';

/**
 * Builds the "Copy report" text for the flat `?debug=1` HUD: everything a stranger testing on a
 * borrowed Quest should send back, read from the diagnostics globals the running systems already
 * publish (`window.__talkingDrum*`). No network use — the caller copies this plain text.
 */
export function buildDebugReport(nowMs: number = performance.now()): string {
  const lines: string[] = [];
  const push = (line: string): void => void lines.push(line);

  push(`Talking Drum VR — debug report`);
  push(`build ${__BUILD_SHA__}  ·  generated ${new Date().toISOString()}`);
  push(`user agent: ${navigator.userAgent}`);

  const rt = window.__talkingDrumRuntime;
  push(`XR session: ${rt?.xrVisibilityState ?? 'unknown'}`);
  push(
    `hands: right ${rt?.handState ?? 'unknown'} (primary ${rt?.primaryHand ?? '-'})  |  player rig identity: ${rt?.playerRigIsIdentity ?? 'unknown'}`,
  );
  if (rt !== undefined) {
    const p = rt.drumWorldPosition;
    push(
      `drum position: (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})  |  strikes ${rt.strikeCount}  |  last speed ${rt.lastStrikeSpeedMps.toFixed(2)} m/s  |  last radial ${rt.lastStrikeRadialMeters.toFixed(3)} m`,
    );
  }

  const panel = window.__talkingDrumDebugPanel;
  const s = panel?.snapshot;
  if (s !== undefined) {
    push(
      `fps: avg ${num(s.fps)}  |  frame avg ${num(s.frameAvgMs)} / max ${num(s.frameMaxMs)} ms  |  max frame gap ${num(s.maxFrameGapMs)} ms`,
    );
    push(
      `pipeline ${num(s.pipelineMs)} ms  |  audio base latency ${num(s.baseLatencyMs)} ms  |  out ${num(s.outputLatencyMs)} ms  |  audio ${s.audioState}`,
    );
    push(
      `calibration: ${s.calibration}  |  open ${num(s.openCurl, 3)}  |  fist ${num(s.fistCurl, 3)}  |  range ${num(s.openCurl - s.fistCurl, 3)}`,
    );
    push(
      `pitch: squeeze ${num(s.squeeze, 2)}  |  band ${s.band}  |  ratio ${num(s.pitchRatio, 2)}  |  left hand ${s.leftHand}`,
    );
    push(
      `lesson: ${s.lessonPhase}  |  level ${s.lessonLevel}  |  phrase ${s.phraseId || '-'}  |  session ${num(s.sessionElapsedSec, 1)}s / cap ${num(s.sessionCapSec, 1)}s  |  capped ${s.capped}`,
    );
  }

  push(`active overrides: ${overridesLine()}`);
  push(
    `placement: distanceAhead ${APP_CONFIG.drumPlacement.distanceAheadMeters} m  |  belowEyeLevel ${APP_CONFIG.drumPlacement.belowEyeLevelMeters} m  |  tilt ${APP_CONFIG.drumPlacement.drumTiltDeg} deg`,
  );
  push(
    `thresholds: strikeMinSpeed ${APP_CONFIG.strike.minDownwardSpeedMetersPerSec} m/s  |  debounce ${APP_CONFIG.strike.debounceMs} ms  |  approachTravel ${APP_CONFIG.strike.minApproachTravelMeters} m  |  approachWindow ${APP_CONFIG.strike.approachWindowMs} ms  |  hitMargin ${APP_CONFIG.strike.hitRadiusMarginMeters} m`,
  );

  push(`marks (newest last):`);
  for (const mark of marks()) {
    push(`  ${markLine(mark)}`);
  }

  push(`report built at ${num(nowMs, 0)} ms since page load`);
  return lines.join('\n');
}

function overridesLine(): string {
  const applied = window.__talkingDrumOverrides ?? [];
  return applied.length === 0 ? 'none' : applied.map((o) => `${o.param}=${o.value}`).join(' ');
}

function marks(): readonly DebugMark[] {
  return window.__talkingDrumDebugPanel?.marks() ?? [];
}

function markLine(m: DebugMark): string {
  return `#${m.index} t ${m.timeSec.toFixed(1)}s  strikes ${m.strikeCount}  v ${m.lastSpeedMps.toFixed(2)} m/s  r ${m.lastRadialMeters.toFixed(3)} m  ${m.phase} ${m.phraseId}`.trimEnd();
}

function num(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

/**
 * Copies `text` to the clipboard. `navigator.clipboard.writeText` first; if it is unavailable or
 * rejects (both happen on plain HTTP, some embedded WebViews, or without a user-gesture), falls
 * back to a hidden, selected textarea + `document.execCommand('copy')`.
 */
export async function copyReportToClipboard(
  text: string,
  doc: Document = document,
): Promise<boolean> {
  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the textarea fallback
    }
  }
  const textarea = doc.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.left = '-9999px';
  doc.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let copied = false;
  try {
    copied = doc.execCommand('copy');
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}
