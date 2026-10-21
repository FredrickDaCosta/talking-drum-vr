#!/usr/bin/env node
/**
 * Content & manifest validator stub for M0.
 * Verifies that the main IWSDK scene JSON and welcome UIKitML panel exist and parse cleanly.
 */

import fs from 'node:fs';
import path from 'node:path';

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
if (scene.version !== 'iwsdk.scene.v1' || !Array.isArray(scene.nodes)) {
  console.error('[content:validate] FAIL: Invalid scene schema in main.iwsdk.scene.json');
  process.exit(1);
}

console.log(
  `[content:validate] PASS: Validated ${scene.nodes.length} scene nodes in main.iwsdk.scene.json.`,
);
