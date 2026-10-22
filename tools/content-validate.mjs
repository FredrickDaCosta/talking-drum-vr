#!/usr/bin/env node
/**
 * Content & manifest validator for Talking Drum VR.
 * Verifies that the main IWSDK scene JSON conforms to the @iwsdk/scene-composition v1 schema
 * (including transform.rotationDeg) and that the welcome UIKitML panel exists.
 */

import fs from 'node:fs';
import path from 'node:path';
import { validateSceneDocument } from '@iwsdk/scene-composition';

const scenePath = path.resolve(process.cwd(), 'public/scenes/main.iwsdk.scene.json');
const panelPath = path.resolve(process.cwd(), 'public/ui/welcome.uikitml');

if (!fs.existsSync(scenePath)) {
  console.error(`[content:validate] FAIL: Missing scene file at ${scenePath}`);
  process.exit(1);
}

if (!fs.existsSync(panelPath)) {
  console.error(`[content:validate] FAIL: Missing UIKitML file at ${panelPath}`);
  process.exit(1);
}

const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const report = validateSceneDocument(scene, {
  knownAssetIds: ['talking-drum', 'welcome-panel'],
  validateAuthoringWorkflow: false,
  validateComponentLinks: false,
});

if (!report.valid) {
  console.error('[content:validate] FAIL: Scene schema validation errors:', report.errors);
  process.exit(1);
}

const drumNode = scene.nodes.find((n) => n.id === 'talking-drum');
if (!drumNode || !Array.isArray(drumNode.transform?.rotationDeg)) {
  console.error(
    '[content:validate] FAIL: talking-drum node is missing transform.rotationDeg in main.iwsdk.scene.json',
  );
  process.exit(1);
}

console.log(
  `[content:validate] PASS: Validated ${scene.nodes.length} scene nodes against iwsdk.scene.v1 schema (talking-drum rotationDeg: [${drumNode.transform.rotationDeg.join(', ')}]).`,
);
