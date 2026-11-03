import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

// Prevent @iwsdk/vite-plugin-dev from auto-downloading or launching a managed Playwright browser locally
process.env.IWSDK_DEV_OPEN ??= 'false';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const basePath = process.env.BASE_PATH ?? '/';

// Build version shown in the debug HUD / panel and the Copy Report (src/debug/report.ts). CI sets
// GITHUB_SHA; a local build falls back to the checked-out commit, or "dev" with no git repo.
function resolveBuildSha(): string {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.slice(0, 7);
  }
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: __dirname,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'dev';
  }
}
const buildSha = resolveBuildSha();

export default defineConfig({
  define: { __BUILD_SHA__: JSON.stringify(buildSha) },
  plugins: [iwsdkDev()],
  server: { host: '0.0.0.0', port: 8081, open: false },
  preview: { host: '0.0.0.0', port: 4173, open: false },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'esnext',
    rollupOptions: {
      input: './index.html',
      output: {
        manualChunks(id) {
          if (
            id.includes('lucide-subset') ||
            id.includes('node_modules/@pmndrs/uikit-lucide') ||
            id.includes('node_modules/@pmndrs/uikit-horizon') ||
            id.includes('node_modules/@drawcall/uikitml')
          ) {
            return 'uikit-kits';
          }
          if (id.includes('node_modules/@pmndrs/uikit')) {
            return 'uikit-core';
          }
          if (id.includes('node_modules/super-three') || id.includes('node_modules/three')) {
            return 'three';
          }
        },
      },
    },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (three@0.185 vs app super-three@0.181). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    alias: [
      {
        find: /^@pmndrs\/uikit-lucide$/,
        replacement: path.resolve(__dirname, 'src/ui/lucide-subset.ts'),
      },
    ],
    dedupe: ['three', '@pmndrs/uikit', '@pmndrs/uikit-horizon', '@pmndrs/uikit-lucide'],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok', '@pmndrs/uikit-lucide'],
    include: ['three', '@pmndrs/uikit', '@pmndrs/uikit-horizon', '@drawcall/uikitml'],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: basePath,
});
