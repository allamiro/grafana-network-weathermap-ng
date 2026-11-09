---
name: weathermap-dependencies
description: Update dependencies and fix security advisories in the Network Weathermap plugin repo — npm audit findings, Dependabot alerts and PRs (including majors that fail CI), lockfile and override changes, patching packages with no fixed release, Node version requirements, and keeping the Grafana catalog validator clean. Use this whenever the user mentions security alerts, vulnerabilities, Dependabot, "update dependencies", npm audit, failing dependency PRs, lockfile errors in CI, or a validator warning about a bundled package.
---

# Dependencies and security

Repo: `allamiro/grafana-network-weathermap-ng`. Never add `Co-Authored-By: Claude` or any AI attribution to commits or PR bodies. The Grafana catalog validator reads `package-lock.json`. A dev-only advisory still matters: 1.6.17 and 1.6.18 never became releases because of one.

## 1. See what's open

```bash
R=repos/allamiro/grafana-network-weathermap-ng
gh api "$R/dependabot/alerts?state=open" --jq '.[]|"\(.number) \(.security_advisory.severity) \(.dependency.package.name) \(.security_vulnerability.vulnerable_version_range) -> \(.security_vulnerability.first_patched_version.identifier // "none") \(.dependency.scope)"'
gh api --paginate "$R/code-scanning/alerts?state=open" --jq '.[]' | jq -s length   # --paginate: the API returns 30 per page
npm audit --json | jq -r '.vulnerabilities[]|.via[]|select(type=="object")|"\(.name) \(.severity) \(.range) \(.url)"' | sort -u
gh pr list --author app/dependabot
```

`npm audit` often reports advisories days before Dependabot opens alerts. Read the GHSA for each one (`gh api /advisories/GHSA-…`) to get the patched version per release line, then `npm ls <pkg>` to see who pulls it in. A Dependabot alert stays open until the fix is on `main`, because Dependabot only scans the default branch.

## 2. Pick the fix

| Situation | Fix |
| --- | --- |
| Direct dependency | Bump it in `package.json`. |
| Transitive, parent allows the patched version | An override, or wait for Dependabot. |
| Pinned by our own `overrides` | Raise the pin. An exact pin (serialize-javascript `7.0.5`) also stops Dependabot's security job ("latest possible version that can be installed is …"). |
| Transitive, parent's range excludes the fix | **Scoped** override: `"overrides": { "<parent>": { "<pkg>": "^x.y.z" } }`. |
| No patched release exists | Vendor a patched copy (§4). |

## 3. Lockfile rules (npm 10 vs 11)

CI's test job runs Node 22, which has **npm 10**; the release job runs Node 24 (npm 11), and a local machine may differ again. `npm ci` fails on a lockfile it considers out of sync, and the two versions disagree:

- **Use scoped overrides, not range keys.** npm 10 doesn't apply range-keyed overrides like `"glob@>=9.0.0 <14.0.2"` the way npm 11 does. With one, CI's `npm ci` rejects the lockfile ("Missing: glob@13.0.7 from lock file").
- **Generate the lockfile with npm 10 and check both versions:**

```bash
rm -rf node_modules && npx -y npm@10.9.4 install --no-audit --no-fund
rm -rf node_modules && npx -y npm@10.9.4 ci --no-audit --no-fund && echo npm10-ok
rm -rf node_modules && npm ci --no-audit --no-fund && echo npm11-ok
npx patch-package          # the brace-expansion patch must show ✔; npm may block postinstall
npm audit                  # must say "found 0 vulnerabilities"
```

- **If npm keeps a stale nested copy** and marks it `invalid` after you add an override, delete that `node_modules/.../<pkg>` entry from `package-lock.json` and reinstall with npm 10.
- **Check the lockfile diff touches only what you meant:** compare the `packages` versions against `origin/main` with a short script rather than reading the raw diff.

## 4. No patched release: vendor a fixed copy

`vendor/braces` (3.0.4) and `vendor/deepmerge` (4.3.2) follow this pattern:

1. Copy the published files into `vendor/<pkg>/` and apply the minimal fix. Upstream fix PRs are a good reference, as are the advisory's linked issue and proposed patches.
2. In `vendor/<pkg>/package.json`, give it a version **just past the affected range** (e.g. 4.3.2 for a `<= 4.3.1` advisory), with a description of the change.
3. In the root `package.json`, add the dev dependency `"<pkg>": "file:vendor/<pkg>"` and the override `"<pkg>": "$<pkg>"`, so every copy resolves to it. Add `<pkg>` to the Dependabot `ignore` list.
4. **Don't keep the code under a `dist/` folder.** `.gitignore` excludes every `dist/`, so the file silently isn't committed and a clean checkout can't load it. Put it at `vendor/<pkg>/index.js` and verify from a clean worktree.
5. Add a README saying what changed and when to drop the copy, plus a test (e.g. `src/vendor.deepmerge.test.ts`). The test should cover each advisory variant, fail with the guard removed, and check that every consumer resolves to the vendored copy (`require.resolve('<pkg>', { paths: [path.dirname(require.resolve('<consumer>'))] })`).

## 5. Dependabot

The setup lives in three files:
- **`.github/dependabot.yml`:** weekly npm updates (minor/patch grouped into one PR), GitHub Actions, and the test exporter's Go module.
- **`dependabot-auto-merge.yml`:** auto-merges patch and minor updates (security fixes included) and npm direct-development-dependency majors once every required check passes. Every other major, including a security fix that needs one, gets a comment and waits: shipped npm dependencies, GitHub Actions and the Go exporter modules.
- **`dependency-audit.yml`:** a weekly `npm audit --audit-level=low` that fails, and so emails the maintainer, on any finding at all. It mainly catches what Dependabot can't fix on its own, such as a package held by an override or one with no patched release, but it doesn't filter for those.

Deliberate pins in the `ignore` list (keep them):

| Pin | Why |
| --- | --- |
| `@grafana/data`, `@grafana/runtime`, `@grafana/ui` stay below 12 | The panel builds against the 11.x SDK; `grafanaDependency` is `>=11.0.0`. |
| React stays below 19 | Grafana supplies React at runtime. |
| `@types/node` stays below 23 | It tracks the oldest supported runtime, Node 22, so `tsc` rejects APIs Node 22 lacks. |
| `braces`, `deepmerge` | Vendored copies. |

When Dependabot opens many PRs at once, apply them on one branch and run CI once (see `weathermap-pr-review` §8). Majors that needed real work in the past:

- **`@grafana/eslint-config` 10:** flat config only. The repo moved to ESLint 9 with `eslint.config.mjs`, which reads `.gitignore` via `includeIgnoreFile` and needs an explicit `files` pattern (ESLint 9 skips `.ts` without one). The lint script is `eslint --cache .`.
- **ESLint 10 is blocked:** `eslint-plugin-react`, loaded by Grafana's config, only declares support up to `^9.7`.
- **`eslint-plugin-react-hooks` 7:** React Compiler rules. `set-state-in-effect`, `refs` and `immutability` warn on 8 existing panel patterns. New code shouldn't add to that list: update refs in effects, not during render.
- **Jest 30:** brings older `glob`/`minimatch` back, so they get scoped overrides on `@jest/reporters`, `jest-config`, `jest-runtime` and `test-exclude`. Keep `jest-environment-jsdom` on the same major. Its jsdom 26 changes CSS serialization (see `weathermap-regression-tests`).
- **`@testing-library/jest-dom` 7:** matcher types need a TypeScript reference; `src/jest-dom.d.ts` provides it.
- **`@swc/core` 1.16:** requires an absolute `jsc.baseUrl` (`path.resolve(process.cwd(), SOURCE_DIR)` in the webpack config).

## 6. Node versions

`engines` is `^22.22.2 || >=24.15.0 <25`. Tools set the floor: eslint-plugin-jsdoc 65 needs `^22.22.2 || >=24.15.0`, and webpack-cli 7's `rechoir` 1.0.0 dependency needs `>=22.15` (webpack-cli itself declares `>=20.9.0`; check transitive `engines` with `npm view <pkg>@<ver> engines`). When a dependency raises its Node floor, update `engines`, README, CONTRIBUTING and the changelog together, and state the upper bound too. Release signing needs Node ≥ 24.5 (`weathermap-release`). The E2E job runs on `ubuntu-24.04`: Playwright 1.58 couldn't install Chromium on `ubuntu-latest`, which is now 26.04.

## 7. Packages that ship in the plugin

A dependency that ends up in `dist/module.js` is scanned by the Grafana catalog validator. React 19 warnings (`react-19-dep-defaultProps`, `react-19-dep-propTypes`) flag any bundled package that assigns `propTypes`/`defaultProps`, even class components where nothing breaks. Before adding a UI library:
- check its build output for those assignments;
- prefer a small local hook over a heavy dependency, as `src/components/useNodeDrag.ts` replaced `react-draggable` in 1.6.23 ([PR #419](https://github.com/allamiro/grafana-network-weathermap-ng/pull/419));
- after building, confirm with `grep -o 'propTypes\|defaultProps' dist/module.js` and the `sources` list in `dist/module.js.map`.

## Before reporting done

Report `npm audit` (should be 0), the open Dependabot and code-scanning alert counts, what each change fixes (GHSA → version), the `npm ci` result on npm 10 and 11, and lint, typecheck, test, build and `verify-dist`. Say which alerts close only after merge (Dependabot rescans `main`) and which advisories have no fix.
