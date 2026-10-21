import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry } from '@iwsdk/core';
import { APP_CONFIG } from '../app/config.js';

/**
 * Procedural M0 placeholder for a Yoruba hourglass talking drum (Gángan / Dùndún).
 * Exported as a deterministic, parentless Object3D prototype for `src/assets.ts`.
 */
function createTalkingDrumPrototype(): Group {
  const root = new Group();
  root.name = 'TalkingDrumRoot';

  const { lengthMeters, headRadiusMeters, waistRadiusMeters, tensionCordCount } =
    APP_CONFIG.drumGeometry;
  const halfLength = lengthMeters / 2;

  const woodMaterial = new MeshStandardMaterial({
    color: 0x8b4513,
    roughness: 0.65,
    metalness: 0.05,
  });

  const membraneMaterial = new MeshStandardMaterial({
    color: 0xf3e5ab,
    roughness: 0.5,
    metalness: 0.02,
  });

  const hoopMaterial = new MeshStandardMaterial({
    color: 0x4a2511,
    roughness: 0.7,
    metalness: 0.08,
  });

  const cordMaterial = new MeshStandardMaterial({
    color: 0xc29b61,
    roughness: 0.8,
    metalness: 0.0,
  });

  // Orient the drum horizontally along the X/Z playing posture (slight 20 deg angle for natural strike access)
  const assembly = new Group();
  assembly.name = 'DrumAssembly';
  assembly.rotation.z = Math.PI / 2;
  assembly.rotation.y = -0.25;

  // Left and right flared wooden cones meeting at the center waist
  const coneGeoLeft = new CylinderGeometry(
    headRadiusMeters,
    waistRadiusMeters,
    halfLength,
    24,
    1,
    false,
  );
  const leftCone = new Mesh(coneGeoLeft, woodMaterial);
  leftCone.name = 'LeftShellCone';
  leftCone.position.y = halfLength / 2;
  assembly.add(leftCone);

  const coneGeoRight = new CylinderGeometry(
    waistRadiusMeters,
    headRadiusMeters,
    halfLength,
    24,
    1,
    false,
  );
  const rightCone = new Mesh(coneGeoRight, woodMaterial);
  rightCone.name = 'RightShellCone';
  rightCone.position.y = -halfLength / 2;
  assembly.add(rightCone);

  // Center waist collar ring
  const waistRingGeo = new TorusGeometry(waistRadiusMeters + 0.004, 0.006, 12, 24);
  const waistRing = new Mesh(waistRingGeo, hoopMaterial);
  waistRing.name = 'WaistCollar';
  waistRing.rotation.x = Math.PI / 2;
  assembly.add(waistRing);

  // Struck leather membranes at both ends
  const headGeo = new CylinderGeometry(headRadiusMeters * 0.98, headRadiusMeters * 0.98, 0.006, 24);
  const leftHead = new Mesh(headGeo, membraneMaterial);
  leftHead.name = 'StrikeMembraneLeft';
  leftHead.position.y = halfLength + 0.002;
  assembly.add(leftHead);

  const rightHead = new Mesh(headGeo, membraneMaterial);
  rightHead.name = 'StrikeMembraneRight';
  rightHead.position.y = -(halfLength + 0.002);
  assembly.add(rightHead);

  // Wooden tension hoops around both heads
  const hoopGeo = new TorusGeometry(headRadiusMeters + 0.005, 0.008, 12, 28);
  const leftHoop = new Mesh(hoopGeo, hoopMaterial);
  leftHoop.name = 'TensionHoopLeft';
  leftHoop.rotation.x = Math.PI / 2;
  leftHoop.position.y = halfLength - 0.004;
  assembly.add(leftHoop);

  const rightHoop = new Mesh(hoopGeo, hoopMaterial);
  rightHoop.name = 'TensionHoopRight';
  rightHoop.rotation.x = Math.PI / 2;
  rightHoop.position.y = -(halfLength - 0.004);
  assembly.add(rightHoop);

  // Tension cords bridging the two hoops around the shell perimeter
  const cordGeo = new CylinderGeometry(0.0025, 0.0025, lengthMeters - 0.01, 8);
  const cordRadius = headRadiusMeters + 0.003;
  const cordsGroup = new Group();
  cordsGroup.name = 'TensionCords';

  for (let i = 0; i < tensionCordCount; i += 1) {
    const angle = (i / tensionCordCount) * Math.PI * 2;
    const cord = new Mesh(cordGeo, cordMaterial);
    cord.name = `TensionCord_${i}`;
    cord.position.set(Math.cos(angle) * cordRadius, 0, Math.sin(angle) * cordRadius);
    cordsGroup.add(cord);
  }
  assembly.add(cordsGroup);

  root.add(assembly);
  return root;
}

export const talkingDrumAsset = createTalkingDrumPrototype();
