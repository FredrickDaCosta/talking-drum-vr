import type { DebugMark, MarkLog } from './mark-log.js';

/**
 * Everything the in-VR debug panel shows, sampled into this preallocated object by
 * VrDebugPanelSystem (no allocation while sampling). Formatting to text runs only at the panel
 * refresh rate (~4 Hz), not per frame.
 */
export interface VrDebugSnapshot {
  fps: number;
  frameAvgMs: number;
  frameMaxMs: number;
  maxFrameGapMs: number;
  strikeCount: number;
  lastSpeedMps: number;
  lastRadialMeters: number;
  pipelineMs: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  rightHand: string;
  leftHand: string;
  squeeze: number;
  band: string;
  pitchRatio: number;
  calibration: string;
  openCurl: number;
  fistCurl: number;
  audioState: string;
  skippedNoContext: number;
  skippedNotRunning: number;
  skippedNoBuffer: number;
  skippedInvalid: number;
  lessonPhase: string;
  lessonLevel: number;
  phraseId: string;
}

export function createVrDebugSnapshot(): VrDebugSnapshot {
  return {
    fps: Number.NaN,
    frameAvgMs: Number.NaN,
    frameMaxMs: Number.NaN,
    maxFrameGapMs: Number.NaN,
    strikeCount: 0,
    lastSpeedMps: 0,
    lastRadialMeters: 0,
    pipelineMs: Number.NaN,
    baseLatencyMs: Number.NaN,
    outputLatencyMs: Number.NaN,
    rightHand: 'UNTRACKED',
    leftHand: 'LOST',
    squeeze: Number.NaN,
    band: '-',
    pitchRatio: Number.NaN,
    calibration: 'not-started',
    openCurl: Number.NaN,
    fistCurl: Number.NaN,
    audioState: 'no-context',
    skippedNoContext: 0,
    skippedNotRunning: 0,
    skippedNoBuffer: 0,
    skippedInvalid: 0,
    lessonPhase: '-',
    lessonLevel: 0,
    phraseId: '',
  };
}

/** Fixed decimals, or "--" for a missing value. Plain ASCII only. */
export function num(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function markText(mark: DebugMark | null): string {
  if (mark === null) {
    return '';
  }
  return `#${mark.index} t ${num(mark.timeSec, 1)} s  strikes ${mark.strikeCount}  v ${num(mark.lastSpeedMps, 2)}  ${mark.phase} ${mark.phraseId}`.trimEnd();
}

/** Number of text lines the panel draws (constant, so the layout never moves). */
export const VR_DEBUG_LINE_COUNT = 12;

/**
 * Writes the panel's text lines into `lines` (length VR_DEBUG_LINE_COUNT). Each line is a
 * "label  value" pair; the panel draws labels and values in fixed columns.
 */
export function formatVrDebugLines(s: VrDebugSnapshot, marks: MarkLog, lines: string[]): string[] {
  lines.length = VR_DEBUG_LINE_COUNT;
  lines[0] = `FPS|${num(s.fps, 1)}   frame avg ${num(s.frameAvgMs, 1)} / max ${num(s.frameMaxMs, 1)} ms (5 s)`;
  lines[1] = `Frame gap|max ${num(s.maxFrameGapMs, 1)} ms (5 s)`;
  lines[2] = `Strikes|${s.strikeCount}   last ${num(s.lastSpeedMps, 2)} m/s   r ${num(s.lastRadialMeters, 3)} m`;
  lines[3] = `Pipeline|${num(s.pipelineMs, 2)} ms   base ${num(s.baseLatencyMs, 1)} / out ${num(s.outputLatencyMs, 1)} ms`;
  lines[4] = `Hands|R ${s.rightHand}   L ${s.leftHand}`;
  lines[5] = `Squeeze|${num(s.squeeze, 2)}   band ${s.band}   pitch ${num(s.pitchRatio, 2)}`;
  lines[6] = `Calib|${s.calibration}   open ${num(s.openCurl, 2)}   fist ${num(s.fistCurl, 2)}`;
  lines[7] = `Audio|${s.audioState}   skip nc ${s.skippedNoContext} nr ${s.skippedNotRunning} nb ${s.skippedNoBuffer} inv ${s.skippedInvalid}`;
  lines[8] = `Lesson|${s.lessonPhase}   L${s.lessonLevel}   ${s.phraseId || '-'}`;
  lines[9] = `Marks|${marks.count}   (touch panel: R = mark, L = hide)`;
  lines[10] = `|${markText(marks.newest(0))}`;
  lines[11] = `|${markText(marks.newest(1))}`;
  return lines;
}
