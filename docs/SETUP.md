# Reproducible Setup & Verification Guide (`docs/SETUP.md`)

This document records the exact commands used to scaffold, configure, build, and verify **Talking Drum VR** in Local / Devcontainer / GitHub Actions environments.

## 1. Environment & Node 24 Standardisation

- **Node version:** `v24.14.1` (`npm 11.17.0`)
- **Devcontainer image:** `mcr.microsoft.com/devcontainers/typescript-node:24-bookworm`
- **Declared engine floor:** `"engines": { "node": ">=20.19" }` (see [ADR-007](adr/ADR-007.md))

## 2. Scaffolding Commands (Completed in M0)

```powershell
# 1. Scaffold outside the repo without installing dependencies or initializing git
Set-Location C:\dev
npx --yes @iwsdk/create@latest tdvr-scaffold-tmp -y --target vr --language ts --no-install --no-git --no-locomotion --no-grabbing --no-physics --skip-reference-warmup

# 2. Copy into C:\dev\talking-drum-vr on branch feat/m0-hello-xr and remove temp folder
Set-Location C:\dev\talking-drum-vr
git checkout -b feat/m0-hello-xr
# (copy scaffold files after creating .gitignore, then remove C:\dev\tdvr-scaffold-tmp)
```

## 3. Dependency Installation (Local Disk-Safe Mode)

Never download Playwright browsers on the local machine (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`), and prevent `@iwsdk/vite-plugin-dev` from auto-downloading a managed Chromium browser (`IWSDK_DEV_OPEN=false`):

```powershell
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
$env:IWSDK_DEV_OPEN = "false"
npm install --no-audit --no-fund
```

## 4. Local Quality & Build Pipeline

```powershell
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run content:validate
npm run build
npm run budget:check
```

## 5. GitHub Repository Settings & Variables (`gh` CLI)

```powershell
# Repository variables controlling base path, deploy switch, and live smoke URL
gh variable set DEPLOY_ENABLED --body "true" -R FredrickDaCosta/talking-drum-vr
gh variable set BASE_PATH --body "/talking-drum-vr/" -R FredrickDaCosta/talking-drum-vr
gh variable set LIVE_URL --body "https://da-costa.online/talking-drum-vr/" -R FredrickDaCosta/talking-drum-vr

# Configure GitHub Pages to deploy from GitHub Actions workflow
gh api -X POST /repos/FredrickDaCosta/talking-drum-vr/pages -f build_type=workflow
```
