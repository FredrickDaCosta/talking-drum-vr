#!/usr/bin/env node
/**
 * Content & manifest validator for Talking Drum VR.
 * Verifies that the main IWSDK scene JSON conforms to the @iwsdk/scene-composition v1 schema
 * (including transform.rotationDeg) and that the welcome UIKitML panel exists, then validates the
 * Phase 2 lesson content (src/content/lessons.ts) with the same validator the unit tests use.
 * The TypeScript sources are bundled in memory with esbuild (a Vite dependency), so this works on
 * any supported Node version without a TS loader.
 */

import fs from 'node:fs';
import path from 'node:path';
import { validateSceneDocument } from '@iwsdk/scene-composition';
import { build } from 'esbuild';

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

const bundled = await build({
  stdin: {
    contents: [
      "export { LESSONS } from './src/content/lessons.ts';",
      "export { validateLessons } from './src/content/validate-lessons.ts';",
      "export { APP_CONFIG } from './src/app/config.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const lessonModule = await import(
  `data:text/javascript,${encodeURIComponent(bundled.outputFiles[0].text)}`
);
const lessonReport = lessonModule.validateLessons(
  lessonModule.LESSONS,
  lessonModule.APP_CONFIG.lesson.minEntriesPerLevel,
);
if (lessonReport.errors.length > 0) {
  console.error('[content:validate] FAIL: Lesson content errors:');
  for (const error of lessonReport.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}
const counts = lessonReport.countsByLevel;
console.log(
  `[content:validate] PASS: ${lessonModule.LESSONS.length} lesson entries (L1 ${counts[1]}, L2 ${counts[2]}, L3 ${counts[3]}); ` +
    `${lessonReport.draftIds.length} still 'draft' (not blocking): ${lessonReport.draftIds.join(', ') || 'none'}.`,
);
