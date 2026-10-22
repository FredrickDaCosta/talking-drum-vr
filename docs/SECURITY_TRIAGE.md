# Security Triage (`docs/SECURITY_TRIAGE.md`)

> **Status:** Read-only triage on branch `chore/security-triage`, taken against `main` at
> `acf8a8f`, 2026-10-22. No fix has been applied to the repo. Every fix below needs CTO approval.

## 1. Data sources and limitations

- **Dependabot alerts API is not readable from the agent session.**
  `gh api repos/FredrickDaCosta/talking-drum-vr/dependabot/alerts` returns
  `403 Resource not accessible by integration`. The advisory list below comes from `npm audit`
  against the same lockfile. The 7-alert split shown in GitHub is mapped to these
  advisories in §2, but that mapping is **inferred, not read from the alerts API (UNVERIFIED)**.
- `npm audit` (npm 10.9.4, lockfile at `acf8a8f`) reports **5 distinct advisories** across
  4 vulnerable packages, plus 2 parent packages flagged only because they depend on `sharp`.

## 2. Advisories

Every vulnerable package in the lockfile has `"dev": true`. None appears in `dist/`:
`grep -rlE 'tinypool|librsvg|@vitest/mocker|sharp' dist` returns no matches, exit code 1.

| GHSA                                                                     | Severity | Package (installed)                    | Vulnerable range         | First patched | Path to package                                                                                                        | Ships in dist?                           |
| ------------------------------------------------------------------------ | -------- | -------------------------------------- | ------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) | critical | `tinypool` 1.1.1                       | `<=2.1.0`                | 2.1.1         | transitive: `vitest@3.2.7 → tinypool`                                                                                  | No (test runner only)                    |
| [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | critical | `tinypool` 1.1.1                       | `<2.1.2`                 | 2.1.2         | transitive: `vitest@3.2.7 → tinypool`                                                                                  | No (test runner only)                    |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | high     | `sharp` 0.35.4 (override)              | `<0.35.5`                | 0.35.5        | transitive: `@iwsdk/vite-plugin-dev@1.0.1 → sharp`; `@iwsdk/reference@1.0.1 → @huggingface/transformers@3.8.1 → sharp` | No (dev server / reference tooling only) |
| [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | moderate | `vitest` 3.2.7, `@vitest/mocker` 3.2.7 | `>=2.1.0 <4.1.11`        | 4.1.11        | `vitest` is a direct dev dependency; `@vitest/mocker` comes in through it                                              | No (test runner only)                    |
| [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) | moderate | `@vitest/mocker` 3.2.7                 | `>=2.1.0-beta.7 <4.1.12` | 4.1.12        | transitive: `vitest@3.2.7 → @vitest/mocker`                                                                            | No (test runner only)                    |

The probable mapping to GitHub's count of 2 critical, 1 high and 4 moderate (UNVERIFIED): one alert for each of the two tinypool
GHSAs, one for sharp, and four moderate alerts made from GHSA-82fw and GHSA-qxg6, each raised against both `vitest` and
`@vitest/mocker`.

**Reachability:** the critical tinypool advisories need an attacker to control worker options or
`run()` options passed to tinypool. In this repo tinypool is only driven by Vitest on the local
unit-test suite. The vitest/mocker advisories affect the Vitest dev/browser-mode server. The sharp
advisory is in librsvg (SVG decoding) and only matters if untrusted SVG is processed at dev
time. No production player is exposed. CI runners and contributor machines are the exposure.

## 3. Fix mapping

| Advisory               | Dependabot PR                                                                                                                          | Minimal change                                                                                      | Major bump?                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| sharp GHSA-wq5f        | none (security job fails, §4)                                                                                                          | `overrides.sharp`: `0.35.4` → `0.35.5`                                                              | No (patch)                    |
| tinypool ×2, vitest ×2 | #3, #4, #5: `vitest` `^3.0.8` → `^5.0.5`. The three PRs have the same package.json diff and the same lockfile patch hash (`b4225d53…`) | `vitest` `^3.0.8` → `^4.1.12`. Vitest 4 no longer depends on tinypool, and mocker 4.1.12 is patched | Yes (3 → 4; the PRs go 3 → 5) |
| none                   | #6 `@types/node` 24 → 26: no security content                                                                                          | Not needed                                                                                          | Yes                           |
| none                   | #7 `vite` 7 → 8: no security content. CI **fails** with `ERESOLVE` because `peer vite@"^7.0.0" from @iwsdk/vite-plugin-dev@1.0.1`      | Not mergeable while IWSDK 1.0.1 is in use                                                           | Yes                           |

Why 4.1.12 rather than 5.0.5: `vitest@4.1.12` accepts Node `^20 || ^22 || >=24`, matching
`engines.node >=20.19`. `vitest@5.0.5` requires Node `^22.12.0 || ^24.0.0 || >=26.0.0`. Both
accept Vite 7.

## 4. Why the sharp security update failed

The cause is the exact `"sharp": "0.35.4"` override. Excerpt from the Dependabot job log (run 39701302140, job 119570915936):

```
Checking if sharp 0.35.4 needs updating
Latest version is 0.35.5
VulnerabilityAuditor: audit result not viable: fix_unavailable
The latest possible version that can be installed is 0.35.4 because of the following conflicting dependencies:
  @iwsdk/reference@1.0.1 requires sharp@0.35.4 via @huggingface/transformers@3.8.1
  @iwsdk/vite-plugin-dev@1.0.1 requires sharp@0.35.4
To resolve this, update @iwsdk/reference, @iwsdk/vite-plugin-dev to a release that depends on a non-vulnerable sharp, or add an override/resolution pinning sharp to a non-vulnerable version.
security_update_not_possible  "latest-resolvable-version": "0.35.4", "lowest-non-vulnerable-version": "0.35.5"
```

The published ranges are `@huggingface/transformers@3.8.1 → sharp ^0.34.1` and
`@iwsdk/vite-plugin-dev@1.0.1 → sharp ^0.35.4` (`npm view`). Neither publishes an exact
`0.35.4`, so the exact requirement Dependabot reports comes from the override rewriting those edges. Dependabot does not edit
`overrides`, so it cannot move the pin. An earlier run (39696906836) failed the same way. The 0.35.4 pin was
originally added to fix the older critical sharp advisories. GHSA-wq5f was published later and needs 0.35.5.

## 5. Proposed `.github/dependabot.yml` (not applied)

```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    open-pull-requests-limit: 5
    ignore:
      - dependency-name: 'vite'
        update-types: ['version-update:semver-major']
      - dependency-name: 'vitest'
        update-types: ['version-update:semver-major']
      - dependency-name: '@vitest/*'
        update-types: ['version-update:semver-major']
      - dependency-name: 'three'
        update-types: ['version-update:semver-major']
      - dependency-name: '@iwsdk/*'
        update-types: ['version-update:semver-major']
      - dependency-name: '@types/node'
        update-types: ['version-update:semver-major']
    groups:
      npm-minor-patch:
        applies-to: version-updates
        update-types: ['minor', 'patch']

  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
    open-pull-requests-limit: 5
    groups:
      actions-minor-patch:
        applies-to: version-updates
        update-types: ['minor', 'patch']
```

Caveats (UNVERIFIED until checked against GitHub docs or a live run):

- I believe `ignore` rules also apply to Dependabot **security** updates. If so, a future
  security fix that needs a vitest/vite major would get no PR. It would still show as an alert,
  and §6 says to fix those by hand.
- `three` is an npm alias of `super-three@0.181.0`. It is unclear whether Dependabot matches the
  alias name or the target. Consider also ignoring majors for `@types/three`.

## 6. Recommended fix plan (lowest risk first)

| #   | Change                                                                                                                     | Risk                                                                                      | Evidence already gathered (scratch copy, not committed)                                                                                                                                | Tests to run after the change                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `overrides.sharp` `0.35.4` → `0.35.5`, regenerate lockfile                                                                 | Very low: patch, dev-only, lockfile diff touches only `sharp` + `@img/sharp-*`            | `npm ls sharp` shows 0.35.5 on both paths. `sharp` loads (libvips 8.18.7) and encodes a PNG. `dist/` sha256 is byte-identical to `main`. Audit drops to 3 advisories (tinypool/mocker) | `npm ci`, `npm ls sharp`, `npm audit`, lint, format:check, typecheck, test:unit, content:validate, build, budget:check, dist sha256 diff against `main`, test:e2e, `npm run dev` boot + `npm run reference:status` |
| 2   | `vitest` `^3.0.8` → `^4.1.12` (**major, needs approval**)                                                                  | Low to medium: dev-only test runner, 36 tests, no vitest config changes needed in scratch | With npm 11.21.1: vitest 4.1.12 runs 36/36 tests, typecheck=0, lint=0, build=0. dist is byte-identical. `npm audit`: **found 0 vulnerabilities** (with fix 1)                          | Same as fix 1. Also check that `vitest.config.ts` runs with no deprecation warnings                                                                                                                                |
| 3   | Close #3, #4 and #5 once fix 2 merges, since they are superseded. Close #6 and #7 (no security content; #7 cannot install) | None (PR housekeeping)                                                                    | #7 CI failure log: `ERESOLVE … peer vite@"^7.0.0" from @iwsdk/vite-plugin-dev@1.0.1`                                                                                                   | None                                                                                                                                                                                                               |
| 4   | Apply the §5 `dependabot.yml`                                                                                              | Low (config only)                                                                         | None                                                                                                                                                                                   | YAML check, then confirm the next Dependabot run in the Insights → Dependency graph → Dependabot tab                                                                                                               |

Note on local tooling: the session image's npm 10.9.4 crashes with
`Cannot read properties of null (reading 'edgesOut')` when changing `vitest` in this tree. npm 11
(the npm bundled with Node 24, which CI uses) installs cleanly, so lockfile regeneration should use
npm 11.
