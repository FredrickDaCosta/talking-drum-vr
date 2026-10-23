/**
 * Edge-triggered "touch" for one hand on the debug panel: fires once when the fingertip enters the
 * panel box, then re-arms only after the fingertip has left it for `rearmMs` (so resting a finger on
 * the panel, or tracking jitter at its edge, cannot fire repeatedly). Pure; no allocation.
 */
export class PanelTouch {
  private inside = false;
  private leftAtMs = -Infinity;
  private armed = true;

  constructor(private readonly rearmMs: number) {}

  /** Feed whether the fingertip is inside the panel this frame; returns true on a new touch. */
  update(nowMs: number, isInside: boolean): boolean {
    if (isInside) {
      const fire = !this.inside && this.armed;
      this.inside = true;
      if (fire) {
        this.armed = false;
      }
      return fire;
    }
    if (this.inside) {
      this.inside = false;
      this.leftAtMs = nowMs;
    }
    if (!this.armed && nowMs - this.leftAtMs >= this.rearmMs) {
      this.armed = true;
    }
    return false;
  }

  reset(): void {
    this.inside = false;
    this.armed = true;
    this.leftAtMs = -Infinity;
  }
}

/** True if a point in the panel's local frame (x right, y up, z out of the face) touches it. */
export function isInsidePanel(
  x: number,
  y: number,
  z: number,
  widthMeters: number,
  heightMeters: number,
  depthMeters: number,
): boolean {
  return (
    Number.isFinite(x) &&
    Math.abs(x) <= widthMeters / 2 &&
    Math.abs(y) <= heightMeters / 2 &&
    Math.abs(z) <= depthMeters
  );
}
