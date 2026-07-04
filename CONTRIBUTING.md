# Contributing

Thank you for your interest in contributing to the Network Weathermap plugin.

## Prerequisites

- Node.js 20 – 24 (`.nvmrc` pins 24; the E2E toolchain caps at 24)
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
| `npm run e2e` | Run Playwright E2E tests |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript type check |

## Docker environment

A fully provisioned local environment is provided via Docker Compose:

```bash
docker-compose up --build
```

This starts Grafana at `http://localhost:3000` with the plugin pre-loaded and sample dashboards provisioned from the `provisioning/` directory.

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
