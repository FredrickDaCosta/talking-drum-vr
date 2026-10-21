# Talking Drum VR

A seated, hands-only WebXR experience that teaches Yoruba tonal patterns through a talking drum (_gángan_ / _dùndún_). Built for the **Meta VR Start Developer Competition 2026** using **Immersive Web SDK (`@iwsdk/core`)**, **Three.js**, **TypeScript (strict)**, and **Vite**.

## Milestone Status: M0 ("Hello XR")

- Seated WebXR VR scene requesting `hand-tracking` (zero controller-only paths).
- Procedural placeholder talking drum positioned `0.5 m` ahead and `0.35 m` below eye level (`[0, 1.25, -0.5]`, recalibrating automatically to actual seated head height on XR entry).
- Centralised tunables in [`src/app/config.ts`](src/app/config.ts) and URL query flag parser in [`src/app/flags.ts`](src/app/flags.ts).
- Configurable asset resolution via `BASE_PATH` (default `/`) and `import.meta.env.BASE_URL`, deployed at [`https://drum.da-costa.online/`](https://drum.da-costa.online/).

## URL Query Flags

Append query flags to the local or deployed URL:

- `?xrfps=1`: Enables the real-time frame-rate overlay (`#xr-fps-overlay`).
- `?debug=1`: Enables the developer debug HUD stub (`#xr-debug-hud`).
- Combined: `?xrfps=1&debug=1`

## Prerequisites

- **Node.js:** `>=20.19` (standardised on **Node 24** across local dev, `.devcontainer`, and GitHub Actions CI; see [ADR-007](docs/adr/ADR-007.md)).

## Quick Start (Local Development)

```bash
# Install dependencies without downloading Playwright browsers locally
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund

# Start the local HTTPS Vite dev server (https://localhost:8081/)
# Note: The browser certificate warning on https://localhost:8081 is expected for localhost only (self-signed dev cert required for WebXR).
npm run dev:runtime

# Run quality checks & production build
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run content:validate
npm run build
npm run budget:check
```

## NPM Scripts

| Script                     | Description                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`              | Start IWSDK dev server (`--no-open` so no managed Chromium is launched)                |
| `npm run dev:runtime`      | Start Vite HTTPS dev server on `https://localhost:8081/`                               |
| `npm run build`            | Production build to `dist/` (uses `BASE_PATH`, default `/`)                            |
| `npm run preview`          | Serve `dist/` locally on `https://localhost:4173/`                                     |
| `npm run lint`             | Run ESLint (flat config) across TypeScript sources and tests                           |
| `npm run format:check`     | Verify code formatting with Prettier                                                   |
| `npm run typecheck`        | Run strict TypeScript check (`tsc --noEmit`)                                           |
| `npm run test:unit`        | Run Vitest unit tests (`tests/unit/`)                                                  |
| `npm run test:e2e`         | Run Playwright e2e smoke tests against `vite preview` (runs in GitHub Actions CI)      |
| `npm run test:e2e:live`    | Run Playwright smoke tests against `LIVE_URL`                                          |
| `npm run content:validate` | Validate scene JSON and UIKitML assets                                                 |
| `npm run budget:check`     | Verify initial-load JS (sum of eager chunks ≤ 1.5 MB gzip) and total `dist/` (≤ 25 MB) |

## Deployment & Freeze Switch (`DEPLOY_ENABLED`)

Deploys run exclusively via GitHub Actions (`.github/workflows/deploy.yml`) on pushes to `main` and `v*` tags when the repository variable `DEPLOY_ENABLED` equals `'true'`.

- **To freeze deployments (e.g. before the 18 Nov 2026 competition deadline):**
  ```bash
  gh variable set DEPLOY_ENABLED --body "false" -R FredrickDaCosta/talking-drum-vr
  ```
- **To switch to a custom domain later:** update the `BASE_PATH` (e.g. `/`) and `LIVE_URL` repository variables—no code change is needed.

## Licence

[MIT](LICENSE)
