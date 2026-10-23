import {
  BoxGeometry,
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { APP_CONFIG, type PitchBand } from '../app/config.js';
import { TalkingDrum } from '../app/talking-drum-component.js';
import { pitchHand } from '../input/left-hand-pitch.js';
import { bandCentreSqueezes, markerHeight } from './pitch-ladder-layout.js';

const BANDS: readonly PitchBand[] = ['L', 'M', 'H'];
const BAND_COLOURS: Record<PitchBand, number> = { L: 0x4f8fd6, M: 0xf0b429, H: 0xe8590c };
const DIM_FACTOR = 0.3;

/**
 * Three-rung pitch indicator beside the drum (left side, for a left-hand squeeze). The marker
 * follows the live squeeze; the rung for the current band is lit. Basic geometry only, built once;
 * the per-frame update only moves existing objects and swaps pre-made materials.
 */
export class PitchLadderSystem extends createSystem({
  drums: { required: [TalkingDrum] },
}) {
  private readonly root = new Group();
  private readonly marker = new Mesh(
    new SphereGeometry(0.012, 16, 12),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  private readonly markerTrackedMat = new MeshBasicMaterial({ color: 0xffffff });
  private readonly markerLostMat = new MeshBasicMaterial({ color: 0x777777 });
  private readonly rungs: Mesh[] = [];
  private readonly litMats: MeshBasicMaterial[] = [];
  private readonly dimMats: MeshBasicMaterial[] = [];
  private readonly scratch = new Vector3();
  private shownBand: PitchBand | null = null;
  private shownTracked: boolean | null = null;

  init(): void {
    const height = APP_CONFIG.pitchLadder.heightMeters;
    this.root.name = 'pitch-ladder';

    const rail = new Mesh(
      new BoxGeometry(0.008, height, 0.008),
      new MeshBasicMaterial({ color: 0x5a3a22 }),
    );
    rail.position.y = height / 2;
    this.root.add(rail);

    const centres = bandCentreSqueezes(APP_CONFIG.pitch);
    const rungGeometry = new BoxGeometry(0.06, 0.012, 0.012);
    for (let i = 0; i < BANDS.length; i += 1) {
      const colour = BAND_COLOURS[BANDS[i]];
      const lit = new MeshBasicMaterial({ color: colour });
      const dim = new MeshBasicMaterial({ color: colour });
      dim.color.multiplyScalar(DIM_FACTOR);
      const rung = new Mesh(rungGeometry, dim);
      rung.name = `pitch-ladder-rung-${BANDS[i]}`;
      rung.position.y = markerHeight(centres[i]);
      this.root.add(rung);
      this.rungs.push(rung);
      this.litMats.push(lit);
      this.dimMats.push(dim);
    }

    this.marker.name = 'pitch-ladder-marker';
    this.marker.position.set(0.04, markerHeight(pitchHand.squeeze), 0);
    this.root.add(this.marker);

    this.world.createTransformEntity(this.root);
  }

  update(): void {
    let drum = null;
    for (const entity of this.queries.drums.entities) {
      if (entity.object3D != null) {
        drum = entity.object3D;
        break;
      }
    }
    if (drum == null) {
      return;
    }
    drum.updateWorldMatrix(true, false);
    const offset = APP_CONFIG.pitchLadder.offsetMeters;
    this.scratch.setFromMatrixPosition(drum.matrixWorld);
    this.scratch.x += offset[0];
    this.scratch.y += offset[1];
    this.scratch.z += offset[2];
    const parent = this.root.parent;
    if (parent != null) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(this.scratch);
    }
    this.root.position.copy(this.scratch);

    this.marker.position.y = markerHeight(pitchHand.squeeze);

    const tracked = pitchHand.tracking !== 'LOST';
    if (tracked !== this.shownTracked) {
      this.shownTracked = tracked;
      this.marker.material = tracked ? this.markerTrackedMat : this.markerLostMat;
    }
    if (pitchHand.band !== this.shownBand) {
      this.shownBand = pitchHand.band;
      for (let i = 0; i < BANDS.length; i += 1) {
        this.rungs[i].material = BANDS[i] === this.shownBand ? this.litMats[i] : this.dimMats[i];
      }
    }
  }
}
