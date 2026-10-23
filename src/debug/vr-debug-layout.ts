import { APP_CONFIG, type AppConfig } from '../app/config.js';

type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => scale(a, 1 / len(a));

function distToSegment(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  return len(sub(p, add(a, scale(ab, t))));
}

/** Points on a rectangle (centre, right and up unit vectors) on an n x n grid, edges included. */
function gridPoints(centre: V3, right: V3, up: V3, w: number, h: number, n = 9): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const u = (i / (n - 1) - 0.5) * w;
      const v = (j / (n - 1) - 0.5) * h;
      pts.push(add(centre, add(scale(right, u), scale(up, v))));
    }
  }
  return pts;
}

export interface DebugPanelLayout {
  centre: V3;
  /** Largest distance from the default eye to any panel point (reach rule, m). */
  maxReachMeters: number;
  /** Smallest distance from the panel to the drum's axis, minus the head radius (m). */
  drumClearanceMeters: number;
  /** Smallest distance from the panel to the lesson panel and to the pitch-ladder rail (m). */
  lessonPanelClearanceMeters: number;
  ladderClearanceMeters: number;
  /** Angle between the panel normal and the direction to the eye (degrees; 0 = facing the eye). */
  facingErrorDeg: number;
}

/**
 * Default-placement geometry of the in-VR debug panel (seated eye, drum at its configured offset),
 * with the panel turned to face the eye as VrDebugPanelSystem does. Used by unit tests to enforce the
 * 0.61 m reach rule and the clearances from the drum, the lesson panel and the ladder.
 */
export function debugPanelLayout(config: AppConfig = APP_CONFIG): DebugPanelLayout {
  const eye: V3 = [0, config.drumPlacement.defaultEyeLevelMeters, 0];
  const drum: V3 = [
    0,
    eye[1] - config.drumPlacement.belowEyeLevelMeters,
    -config.drumPlacement.distanceAheadMeters,
  ];
  const dp = config.debugPanel;
  const centre = add(drum, [dp.offsetMeters[0], dp.offsetMeters[1], dp.offsetMeters[2]]);
  const normal = norm(sub(eye, centre));
  const right = norm(cross([0, 1, 0], normal));
  const up = cross(normal, right);
  const points = gridPoints(centre, right, up, dp.widthMeters, dp.heightMeters);

  const tilt = (config.drumPlacement.drumTiltDeg * Math.PI) / 180;
  const half = config.drumGeometry.lengthMeters / 2;
  const axis: V3 = [0, Math.cos(tilt), Math.sin(tilt)];
  const top = add(drum, scale(axis, half));
  const bottom = add(drum, scale(axis, -half));

  const lp = config.lessonPanel;
  const lessonCentre = add(drum, [lp.offsetMeters[0], lp.offsetMeters[1], lp.offsetMeters[2]]);
  const lessonPoints = gridPoints(
    lessonCentre,
    [1, 0, 0],
    [0, 1, 0],
    lp.widthMeters,
    lp.heightMeters,
  );

  const lad = config.pitchLadder;
  const ladderBottom = add(drum, [lad.offsetMeters[0], lad.offsetMeters[1], lad.offsetMeters[2]]);
  const ladderTop = add(ladderBottom, [0, lad.heightMeters, 0]);

  let maxReach = 0;
  let drumClear = Infinity;
  let lessonClear = Infinity;
  let ladderClear = Infinity;
  for (const p of points) {
    maxReach = Math.max(maxReach, len(sub(p, eye)));
    drumClear = Math.min(
      drumClear,
      distToSegment(p, bottom, top) - config.drumGeometry.headRadiusMeters,
    );
    ladderClear = Math.min(ladderClear, distToSegment(p, ladderBottom, ladderTop));
    for (const q of lessonPoints) {
      lessonClear = Math.min(lessonClear, len(sub(p, q)));
    }
  }
  return {
    centre,
    maxReachMeters: maxReach,
    drumClearanceMeters: drumClear,
    lessonPanelClearanceMeters: lessonClear,
    ladderClearanceMeters: ladderClear,
    facingErrorDeg: (Math.acos(Math.min(1, dot(normal, norm(sub(eye, centre))))) * 180) / Math.PI,
  };
}
