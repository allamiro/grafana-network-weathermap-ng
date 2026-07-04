# Contributing

Thank you for your interest in contributing to the Network Weathermap plugin.

## Prerequisites

- Node.js 20+
- npm 9+
- Docker (for the local Grafana environment)

## Setup

```bash
git clone https://github.com/allamiro/grafana-network-weathermap-ng.git
cd grafana-network-weathermap-ng
npm install --legacy-peer-deps
```

## Development

```bash
# Start webpack in watch mode
npm run dev

# In a separate terminal, start Grafana with the plugin loaded
npm run server
```

Grafana will be available at `http://localhost:3000` (admin / admin).

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start webpack in watch mode |
| `npm run build` | Production build |
| `npm run test:ci` | Run unit tests |
| `npm run e2e` | Run Playwright E2E tests (`GRAFANA_URL` targets any instance) |
| `npm run e2e:local` | E2E against the anonymous-admin `testing/` stack on :3101 |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript type check |

## Docker environments

There are two Compose environments with different jobs:

**Dev server** (repo root — what `npm run server` runs):

```bash
docker compose up --build
```

Grafana at `http://localhost:3000` (admin / admin) with `dist/` mounted as the plugin and the `provisioning/` directory applied. Pair it with `npm run dev` for watch-mode rebuilds.

**Demo & E2E playground** (`testing/`):

```bash
cd testing && docker compose up --build
```

Grafana at `http://localhost:3101` (anonymous admin, login form disabled) with the plugin pre-loaded, a Prometheus datasource, a simulated-WAN exporter, and every demo dashboard provisioned — WAN utilization, incident replay, rack boards, the world-map backbone. This is the stack the Use Cases guide, the Grafana review instructions, and `npm run e2e:local` target. Pin a Grafana version with `GRAFANA_VERSION=11.0.0 docker compose up --build`.

### Running E2E locally

```bash
cd testing && docker compose up -d      # Grafana on :3101
npm run e2e:local                        # seeds anonymous auth, runs the suite
# or against any instance with password auth:
GRAFANA_URL=http://localhost:3000 npm run e2e
```

`PW_CHANNEL=chrome` reuses your system Chrome instead of downloading Playwright's bundled browser. In CI, the E2E workflow runs weekly, on demand, and on PRs touching `tests/**` or the Playwright config.

## Submitting changes

1. Open an issue first to discuss significant changes
2. Fork the repo and create a branch from `main`
3. Make your changes and add tests where applicable
4. Ensure `npm run test:ci` and `npm run typecheck` pass
5. Open a pull request referencing the issue number

## Releasing

Releases are **tag-driven**: pushing a tag `vX.Y.Z` triggers
[`release.yml`](.github/workflows/release.yml), which builds, signs, generates a
provenance attestation, and publishes a GitHub release. The workflow verifies
that the tag matches the `version` in `package.json`, so the two must stay in
sync. We ship each release via a `release/vX.Y.Z` PR that is reviewed and merged
before tagging.

Use the helper script (`scripts/release.sh`, also `npm run release`):

```bash
# 1. Prepare: branch off origin/main, bump package.json, edit CHANGELOG, push.
scripts/release.sh prepare 1.5.3        # or: npm run release -- prepare 1.5.3

# 2. Open the release PR, let CI pass, and squash-merge it into main.

# 3. Tag: verify main is on the new version, then push the tag to publish.
scripts/release.sh tag 1.5.3            # or: npm run release -- tag 1.5.3
```

### Release checklist

- [ ] All feature/fix PRs for the release are merged into `main`
- [ ] Pick a version per [semver](https://semver.org/): new feature → minor, bug/chore → patch
- [ ] `scripts/release.sh prepare <version>` — bumps `package.json` and opens `CHANGELOG.md`
- [ ] CHANGELOG entry added at the top with the correct date and issue/PR links
- [ ] Open the `release/vX.Y.Z` PR; confirm CI (lint, typecheck, test, build, API checks) is green
- [ ] Squash-merge the release PR into `main`
- [ ] `scripts/release.sh tag <version>` — pushes `vX.Y.Z`
- [ ] Confirm the release workflow succeeds and the GitHub release + `.zip` asset are published

## Reporting bugs

Use the [bug report template](https://github.com/allamiro/grafana-network-weathermap-ng/issues/new?template=bug_report.yml).

## License

By contributing you agree that your contributions will be licensed under the Apache-2.0 license.
