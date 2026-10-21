# Test Plan (M0 Stub)

## Verification Layers

1. **Static Analysis:** ESLint (`npm run lint`), Prettier (`npm run format:check`), and strict TypeScript (`npm run typecheck`).
2. **Unit Tests (Vitest):** `npm run test:unit` validates pure logic modules (`src/app/flags.ts`, `src/app/config.ts`).
3. **Bundle Budget Check:** `npm run budget:check` enforces initial JS ≤ 1.5 MB gzipped and total `dist/` ≤ 25 MB.
4. **End-to-End & Smoke Tests (Playwright in GitHub Actions):**
   - `npm run test:e2e`: Loads the built site via `vite preview`, asserts zero console errors, zero failed/404 network requests, and presence of the `Enter VR` control.
   - `npm run test:e2e:live`: Runs the same checks against the deployed GitHub Pages URL (`LIVE_URL`).
5. **Manual XR Emulator Verification:** Desktop Chrome with the Immersive Web Emulator extension (`metaQuest3` hand-tracking profile).
