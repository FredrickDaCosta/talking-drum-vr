#!/usr/bin/env node
/**
 * Honest bundle budget check for Talking Drum VR (M0+).
 *
 * Enforces:
 * 1. Initial-load JS (entry chunk + all statically imported / modulepreloaded chunks, gzipped sum) <= 1.5 MB
 * 2. Total dist/ directory size (uncompressed) <= 25 MB
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');

// Use decimal 1.5 MB (1,500,000 bytes) which is stricter than 1.5 MiB (1,572,864 bytes)
const MAX_INITIAL_JS_GZIP_BYTES = 1_500_000;
const MAX_TOTAL_DIST_BYTES = 25_000_000;

if (!fs.existsSync(INDEX_HTML)) {
  console.error(`[budget:check] FAIL: ${INDEX_HTML} does not exist. Run "npm run build" first.`);
  process.exit(1);
}

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function stripBasePath(urlPath) {
  // Resolve an asset URL from index.html (e.g. "/assets/foo.js" or "./assets/foo.js")
  // into a path relative to dist/
  const idx = urlPath.indexOf('assets/');
  if (idx !== -1) {
    return urlPath.slice(idx);
  }
  return urlPath.replace(/^\/+/, '');
}

function collectStaticJsGraph(entryRelPaths) {
  const visited = new Set();
  const queue = [...entryRelPaths];

  while (queue.length > 0) {
    const rel = queue.shift();
    if (!rel || visited.has(rel)) {
      continue;
    }
    const fullPath = path.join(DIST_DIR, rel);
    if (!fs.existsSync(fullPath) || !fullPath.endsWith('.js')) {
      continue;
    }
    visited.add(rel);

    const code = fs.readFileSync(fullPath, 'utf8');
    // Match static ES module imports (`from "./chunk.js"` or `from"./chunk.js"` or `import"./chunk.js"`),
    // excluding dynamic `import("./chunk.js")` calls.
    const staticImportRegex = /(?:from\s*|import\s*)(['"])(\.[^'"]+\.js)\1/g;
    let match;
    while ((match = staticImportRegex.exec(code)) !== null) {
      const importedRel = path.posix.normalize(
        path.posix.join(path.posix.dirname(rel.replace(/\\/g, '/')), match[2]),
      );
      if (!visited.has(importedRel)) {
        queue.push(importedRel);
      }
    }
  }

  return [...visited];
}

const html = fs.readFileSync(INDEX_HTML, 'utf8');
const initialSeedPaths = [];

// 1. Entry <script type="module" ... src="...">
for (const match of html.matchAll(/<script\b[^>]*\bsrc=(['"])([^'"]+)\1[^>]*>/gi)) {
  initialSeedPaths.push(stripBasePath(match[2]));
}

// 2. <link rel="modulepreload" ... href="...">
for (const match of html.matchAll(
  /<link\b[^>]*\brel=(['"])modulepreload\1[^>]*\bhref=(['"])([^'"]+)\2[^>]*>/gi,
)) {
  initialSeedPaths.push(stripBasePath(match[3]));
}
for (const match of html.matchAll(
  /<link\b[^>]*\bhref=(['"])([^'"]+)\1[^>]*\brel=(['"])modulepreload\3[^>]*>/gi,
)) {
  initialSeedPaths.push(stripBasePath(match[2]));
}

const eagerJsChunks = collectStaticJsGraph(initialSeedPaths);
if (eagerJsChunks.length === 0) {
  console.error('[budget:check] FAIL: Could not find any initial JS chunks in dist/index.html.');
  process.exit(1);
}

let initialJsRawBytes = 0;
let initialJsGzipBytes = 0;

console.log('=== Initial-Load JS Chunks (Entry + Static Imports / Modulepreload) ===');
for (const rel of eagerJsChunks) {
  const fullPath = path.join(DIST_DIR, rel);
  const buf = fs.readFileSync(fullPath);
  const gz = zlib.gzipSync(buf, { level: 9 });
  initialJsRawBytes += buf.length;
  initialJsGzipBytes += gz.length;
  console.log(
    `  - ${rel.replace(/\\/g, '/')}: ${(buf.length / 1000).toFixed(2)} kB raw | ${(gz.length / 1000).toFixed(2)} kB gzip`,
  );
}

const allDistFiles = walkFiles(DIST_DIR);
let totalDistBytes = 0;
for (const file of allDistFiles) {
  totalDistBytes += fs.statSync(file).size;
}

const initialGzipMB = (initialJsGzipBytes / 1_000_000).toFixed(3);
const initialRawMB = (initialJsRawBytes / 1_000_000).toFixed(3);
const totalDistMB = (totalDistBytes / 1_000_000).toFixed(3);

console.log('\n=== Bundle Budget Summary ===');
console.log(
  `Initial-load JS (sum of ${eagerJsChunks.length} eager chunks): ${initialJsRawBytes} B (${initialRawMB} MB raw) | ${initialJsGzipBytes} B (${initialGzipMB} MB gzip) [limit: ${(MAX_INITIAL_JS_GZIP_BYTES / 1_000_000).toFixed(2)} MB gzip]`,
);
console.log(
  `Total dist/ size (${allDistFiles.length} files): ${totalDistBytes} B (${totalDistMB} MB) [limit: ${(MAX_TOTAL_DIST_BYTES / 1_000_000).toFixed(2)} MB]`,
);

let failed = false;
if (initialJsGzipBytes > MAX_INITIAL_JS_GZIP_BYTES) {
  console.error(
    `[budget:check] FAIL: Initial-load JS gzipped size (${initialGzipMB} MB) exceeds limit (${(MAX_INITIAL_JS_GZIP_BYTES / 1_000_000).toFixed(2)} MB).`,
  );
  failed = true;
}
if (totalDistBytes > MAX_TOTAL_DIST_BYTES) {
  console.error(
    `[budget:check] FAIL: Total dist size (${totalDistMB} MB) exceeds limit (${(MAX_TOTAL_DIST_BYTES / 1_000_000).toFixed(2)} MB).`,
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log('[budget:check] PASS: All bundle budgets satisfied.');
