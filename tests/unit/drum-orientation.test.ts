import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../src/app/config.js';
import {
  computeTiltedDrumTopHeadCenter,
  computeTiltedDrumTopHeadNormal,
  computeTiltedTopHeadReachFromEye,
} from '../../src/input/hand-tracker.js';
import { talkingDrumAsset } from '../../src/scene-assets/talking-drum.scene-asset.js';

describe('talking-drum geometry single source of truth & 30 deg tilt orientation', () => {
  it('shares halfLengthMeters (0.19 m) and headRadiusMeters (0.11 m) between APP_CONFIG and talkingDrumAsset with no baked rotation', () => {
    const expectedHalfLength = APP_CONFIG.drumGeometry.lengthMeters / 2;
    const recordedGeometry = talkingDrumAsset.userData.drumGeometry as
      { lengthMeters: number; halfLengthMeters: number; headRadiusMeters: number } | undefined;

    expect(recordedGeometry).toBeDefined();
    expect(recordedGeometry?.lengthMeters).toBe(APP_CONFIG.drumGeometry.lengthMeters);
    expect(recordedGeometry?.halfLengthMeters).toBe(expectedHalfLength);
    expect(recordedGeometry?.headRadiusMeters).toBe(APP_CONFIG.drumGeometry.headRadiusMeters);

    const assembly = talkingDrumAsset.getObjectByName('DrumAssembly');
    expect(assembly).toBeDefined();
    // Long axis must be +Y in asset space (zero baked rotation)
    expect(assembly?.rotation.x).toBe(0);
    expect(assembly?.rotation.y).toBe(0);
    expect(assembly?.rotation.z).toBe(0);

    const topHead = talkingDrumAsset.getObjectByName('StrikeMembraneLeft');
    const bottomHead = talkingDrumAsset.getObjectByName('StrikeMembraneRight');
    expect(topHead?.position.y).toBeCloseTo(expectedHalfLength + 0.002, 6);
    expect(bottomHead?.position.y).toBeCloseTo(-(expectedHalfLength + 0.002), 6);
  });

  it('keeps public/scenes/main.iwsdk.scene.json rotationDeg synchronized with APP_CONFIG.drumPlacement.drumTiltDeg', () => {
    const scenePath = resolve(process.cwd(), 'public/scenes/main.iwsdk.scene.json');
    const sceneDoc = JSON.parse(readFileSync(scenePath, 'utf8')) as {
      nodes: Array<{
        id: string;
        transform?: { position?: number[]; rotationDeg?: number[] };
      }>;
    };

    const drumNode = sceneDoc.nodes.find((node) => node.id === 'talking-drum');
    expect(drumNode).toBeDefined();
    expect(drumNode?.transform?.rotationDeg).toEqual([APP_CONFIG.drumPlacement.drumTiltDeg, 0, 0]);
  });

  it('computes the top-head normal from drumTiltDeg = 30 deg as (0, 0.8660254, 0.5)', () => {
    const normal = computeTiltedDrumTopHeadNormal(APP_CONFIG.drumPlacement.drumTiltDeg);
    expect(normal.x).toBeCloseTo(0, 6);
    expect(normal.y).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 6);
    expect(normal.y).toBeCloseTo(0.8660254, 6);
    expect(normal.z).toBeCloseTo(0.5, 6);
  });

  it('places the tilted top-head centre at [0, 1.4145, -0.4050] within 0.61 m comfortable seated reach', () => {
    const metrics = computeTiltedTopHeadReachFromEye(APP_CONFIG, 1.6);

    expect(metrics.drumCenterWorld).toEqual({ x: 0, y: 1.25, z: -0.5 });
    expect(metrics.topHeadCenterWorld.x).toBeCloseTo(0, 6);
    expect(metrics.topHeadCenterWorld.y).toBeCloseTo(1.414545, 5);
    expect(metrics.topHeadCenterWorld.z).toBeCloseTo(-0.405, 6);

    expect(metrics.horizontalDistanceMeters).toBeCloseTo(0.405, 6);
    expect(metrics.euclideanDistanceMeters).toBeCloseTo(0.4454, 3);
    expect(metrics.euclideanDistanceMeters).toBeLessThanOrEqual(0.61);

    const directCenter = computeTiltedDrumTopHeadCenter(
      { x: 0, y: 1.25, z: -0.5 },
      APP_CONFIG.drumGeometry.lengthMeters / 2,
      APP_CONFIG.drumPlacement.drumTiltDeg,
    );
    expect(directCenter).toEqual(metrics.topHeadCenterWorld);
  });
});
