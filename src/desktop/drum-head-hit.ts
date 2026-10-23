import { type Camera, Vector3 } from '@iwsdk/core';

/** Even-odd point-in-polygon test on the first `count` vertices (no allocation). */
export function pointInPolygon(
  x: number,
  y: number,
  xs: Float64Array,
  ys: Float64Array,
  count: number,
): boolean {
  let inside = false;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const yi = ys[i];
    const yj = ys[j];
    if (yi > y !== yj > y && x < ((xs[j] - xs[i]) * (y - yi)) / (yj - yi) + xs[i]) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Projects the rim of the drum's top head (a circle of `radius` around `centre`, perpendicular to
 * `normal`) into normalised device coordinates. A click inside the projected outline strikes the
 * drum. Pure screen-space geometry; the preallocated outputs avoid per-click allocation.
 */
export class DrumHeadOutline {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  private readonly u = new Vector3();
  private readonly v = new Vector3();
  private readonly p = new Vector3();

  constructor(readonly points: number) {
    this.xs = new Float64Array(points);
    this.ys = new Float64Array(points);
  }

  project(camera: Camera, centre: Vector3, normal: Vector3, radius: number): void {
    // Two unit vectors spanning the head plane.
    this.u.set(1, 0, 0);
    if (Math.abs(this.u.dot(normal)) > 0.9) {
      this.u.set(0, 0, 1);
    }
    this.u.cross(normal).normalize();
    this.v.copy(normal).cross(this.u).normalize();
    for (let i = 0; i < this.points; i += 1) {
      const a = (i / this.points) * Math.PI * 2;
      this.p
        .copy(centre)
        .addScaledVector(this.u, Math.cos(a) * radius)
        .addScaledVector(this.v, Math.sin(a) * radius)
        .project(camera);
      this.xs[i] = this.p.x;
      this.ys[i] = this.p.y;
    }
  }

  contains(ndcX: number, ndcY: number): boolean {
    return pointInPolygon(ndcX, ndcY, this.xs, this.ys, this.points);
  }
}
