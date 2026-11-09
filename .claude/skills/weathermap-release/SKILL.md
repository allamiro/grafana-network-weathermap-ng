---
name: weathermap-release
description: Cut, tag and publish a release of the Network Weathermap Grafana plugin (release/vX.Y.Z PR, CHANGELOG entry, version bump, signed tag build, publishing the draft GitHub release, closing the fixed issues). Use this whenever the user says "cut the release", "ship it", "release 1.6.x", "bump the version", "tag a release", "write the changelog/release notes", or asks to publish fixes that are already merged, even if they don't say the word "release".
---

# Releasing the Network Weathermap plugin

Releases are tag-driven. Pushing `vX.Y.Z` runs `.github/workflows/release.yml`, which tests, builds, community-signs and attests the plugin, then creates a **draft** GitHub release. The workflow refuses a tag that doesn't match `package.json`, so the version bump always lands on `main` first, through a `release/vX.Y.Z` PR.

Repo: `allamiro/grafana-network-weathermap-ng`. Commits are authored as the maintainer: never add `Co-Authored-By: Claude` or any other AI attribution to commits, squash merges or PR bodies.

## 1. Decide what ships

```bash
git fetch origin --tags
LAST=$(git describe --tags --abbrev=0 origin/main)
git log --oneline "$LAST"..origin/main
gh pr list --state open        # anything the user expects in this release?
```

- Every fix/feature PR meant for the release must be merged first. If one is still open, land it (see the `weathermap-pr-review` skill) or open the release PR as a draft that names the merge order.
- Version per semver: a breaking change (a saved dashboard or setting that stops working, a raised minimum Grafana version) is a major bump, a new feature is a minor bump, and fixes/chores/security are a patch bump. If a change might break existing dashboards, ask the user before choosing.
- Run `npm audit`. The Grafana catalog validator reads the lockfile: 1.6.17 and 1.6.18 were tagged but never became releases because a dependency advisory failed validation. Fix advisories (overrides in `package.json`) in their own PR before tagging.

## 2. Release branch, version bump, changelog

`scripts/release.sh prepare X.Y.Z` opens `$EDITOR` and blocks, so do its steps directly:

```bash
git checkout -b release/vX.Y.Z origin/main
npm version X.Y.Z --no-git-tag-version   # updates package.json and package-lock.json
```

Add the entry at the top of `CHANGELOG.md`, above the previous version:

```markdown
## [X.Y.Z](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/vX.Y.Z) (YYYY-MM-DD)

### Fixed

* **what the user no longer sees, in plain words** ([#375](https://github.com/allamiro/grafana-network-weathermap-ng/issues/375), [PR #376](https://github.com/allamiro/grafana-network-weathermap-ng/pull/376)): what went wrong and when, the cause in one or two sentences, what changed, and what deliberately did not change.
```

Sections in use: `Fixed`, `Features`, `Security`, `Tests`, `Documentation`, `Chores`. The release workflow copies this entry into the GitHub release notes, so it's what users read. Write it that way:

- Lead with the visible symptom (`5 undefined`, `n/a`, "graph disappeared on the second hover"), then the cause, then the fix.
- Link **every** issue and PR reference as a full URL. The AI reviewer flags a bare `#370`.
- Credit outside contributors by GitHub handle.
- Say "No dashboard migration or new setting is needed" when that's true. Users check that first.
- Use the release date (today, absolute), not the date the work started.

Read the merged PRs' bodies (`gh pr view N --json body`) and the issues for accurate wording. Don't guess the symptoms.

## 3. Release PR

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): vX.Y.Z <short summary>"
git push -u origin release/vX.Y.Z
gh pr create --base main --title "chore(release): vX.Y.Z <short summary>" --body-file <file>
```

PR body: one line on the bump, a "What ships" list (issue → PR), "No dashboard migration…" if true, and the after-merge steps (tag, verify signature, publish the draft, comment on issues). Use `--draft` while any PR it describes is still unmerged.

Wait for CI and the cubic AI review. Handle cubic threads as in the `weathermap-pr-review` skill: fix or answer, reply and resolve. If `main` moved (e.g. a fix merged after you branched), rebase the release branch onto `origin/main` and `git push --force-with-lease`, so CI runs against the code that will be tagged.

## 4. Merge and tag

```bash
gh pr ready <N>    # if it was opened as a draft: gh pr merge refuses drafts
gh pr merge <N> --squash --subject "chore(release): vX.Y.Z <summary> (#N)" --body "<one line, no co-author trailers>" --delete-branch
git checkout main && git pull --ff-only
scripts/release.sh tag X.Y.Z
```

Pass `--body` explicitly: without it GitHub copies every branch commit's `Co-authored-by` trailer into the squash commit. `release.sh tag` refuses if `origin/main` isn't on X.Y.Z. That error means the release PR isn't merged yet, not that something is broken.

When checking a merge commit for AI attribution, match AI names only. GitHub also adds `Co-authored-by: <maintainer> <other email>` when the branch has commits from the maintainer's second git identity (e.g. `ghost-m5@Mac.lan`); that's the maintainer, not an AI:

```bash
git log -1 --format=%B | grep -qiE 'co-authored-by:.*(claude|anthropic|codex|openai|copilot)|generated with \[claude' && echo "AI attribution"
```

**Chaining the steps.** Waiting on CI is most of a release's wall time (each PR run ≈ 5 min, E2E included). Rather than stopping between steps, enable auto-merge on the release PR (`gh pr merge N --auto --squash --subject … --body …`) and run one background job that waits for the merge, tags, watches the release run, verifies and publishes (sections 4–5), stopping on the first failed check. Handle any cubic/Codex threads before enabling auto-merge: auto-merge doesn't wait for review threads.

## 5. Verify the build, then publish

Find the run for *this* tag. The tag push starts it asynchronously, so it can take a few seconds to appear, and the newest release run may be an older tag's:

```bash
V=X.Y.Z
TAG_SHA=$(git rev-parse "v$V^{commit}")
until RID=$(gh run list --workflow release.yml --branch "v$V" --commit "$TAG_SHA" --limit 1 --json databaseId --jq '.[0].databaseId // empty') && [ -n "$RID" ]; do sleep 5; done
gh run watch "$RID" --exit-status   # run in the background; non-zero means stop here
```

Then check the asset and publish, with each check able to stop the publish:

```bash
set -euo pipefail
V=X.Y.Z; D=$(mktemp -d)
gh release download "v$V" -D "$D"
[ "$(cut -d' ' -f1 "$D"/*.sha1)" = "$(shasum "$D"/*.zip | cut -d' ' -f1)" ]       || { echo "checksum mismatch"; exit 1; }
(cd "$D" && shasum -a 256 -c *.zip.sha256)                                         || { echo "sha256 mismatch"; exit 1; }
[ "$(unzip -p "$D"/*.zip '*/plugin.json' | jq -r .info.version)" = "$V" ]          || { echo "wrong version"; exit 1; }
# read the manifest first: piping into grep -q under pipefail fails on SIGPIPE even when it matches
M=$(unzip -p "$D"/*.zip '*/MANIFEST.txt')
grep -q '"signatureType": "community"' <<<"$M"                                   || { echo "not community-signed"; exit 1; }
gh release edit "v$V" --draft=false --latest
```

The workflow already checks the signature. Downloading the asset confirms that what users will install is the right version with a matching checksum. If any check fails, the release stays a draft. Tell the user rather than retrying.

If the release workflow fails after the tag is pushed, stop and tell the user. Don't delete or move a pushed tag on your own. The repo's past practice is to fix forward with the next patch version, as 1.6.19 did after 1.6.17 and 1.6.18 failed validation.

- **A tag can only be re-pointed if no release was created from it,** and only with the user's go-ahead (v1.6.21 was re-pointed after its signing step failed, before any draft existed). A **published** release is never replaced: someone may have downloaded it or submitted its zip and SHA1 to Grafana. Ship a new patch version instead (v1.6.22 carried the dependency updates rather than rebuilding 1.6.21).
- **Re-running a failed release run doesn't help** after fixing `release.yml` on `main`: a tag-triggered run uses the workflow file from the tagged commit.
- **Signing needs Node ≥ 24.5.** `npm run sign` runs `npx @grafana/sign-plugin@latest`, and sign-plugin 4.0.0 (2026-10-22) exits with `Node.js >=24.5.0 is required`. Both release jobs pin `node-version: '>=24.5.0 <25'`; if a future sign-plugin raises the floor again, raise this range (keep both jobs on the same Node).
- **build-plugin** is at 2.0.0 (default Node 22, but the explicit `node-version` wins). Check its release notes before bumping its major: only a real tag exercises it.

## 6. Close the loop on issues

Convention: an issue fixed for a release gets a comment with the release link once the signed release is published, and is closed then if `Closes #N` didn't already close it.

```bash
gh issue comment <N> --body "Released in [vX.Y.Z](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/vX.Y.Z). <one line on what the reporter will now see>. Thanks @<reporter>!"
gh issue close <N>   # only if still open
```

## 7. Grafana catalog submission

The user submits the release to the Grafana plugin catalog by hand at `grafana.com/orgs/tamirsuliman/plugins/tamirsuliman-weathermap-panel/update-plugin`. There's no browser access from here, so hand over the values ready to paste:

| Form field | Value |
| --- | --- |
| Plugin (zip file) → Paste a URL | `https://github.com/allamiro/grafana-network-weathermap-ng/releases/download/vX.Y.Z/tamirsuliman-weathermap-panel-X.Y.Z.zip` (use this form, not the signed `release-assets.githubusercontent.com` redirect, which expires) |
| MD5 or SHA1 | the 40-character SHA1 from the verify step |
| Source code → Paste a URL | `https://github.com/allamiro/grafana-network-weathermap-ng/tree/vX.Y.Z` |
| Testing guidance | plain text, written for a Grafana reviewer (below) |
| Provisioning provided for test environment | Yes |

**Testing guidance** covers: what kind of release it is and that nothing needs credentials; the test stack (`git clone --branch vX.Y.Z …`, `npm ci && npm run build`, `cd testing && docker compose up --build grafana prometheus exporter`, Grafana on `http://localhost:3101` with anonymous Admin; the full stack only for the InfluxDB/MySQL/Postgres/Elasticsearch/Zabbix dashboards); the Node version needed to build; numbered steps to check each change, with the expected result; and the security/build facts (audit result, signing, checksums, which automated checks ran). Check `testing/grafana/Dockerfile` and `testing/docker-compose.yml` before writing it, and write repro steps that actually show the change (e.g. a three-node panel to show anchor re-centring, not a dashboard where removing a node removes every link).

**After submitting, read the validator report** the user pastes back. Warnings don't block review ("can be reviewed"), but they show on every submission:

- `react-19-dep-defaultProps` / `react-19-dep-propTypes` flag any bundled package that assigns those. The validator scans the bundle and source map, so the fix is to stop bundling the package, not to configure it. That's why `react-draggable` was replaced by `src/components/useNodeDrag.ts` in 1.6.23. Before adding a UI dependency, check its bundle for `propTypes =` / `defaultProps =`, and check `dist/module.js` for those strings after building.
- Confirm a fix in the bundle, not just the source: `grep -o 'propTypes\|defaultProps' dist/module.js` and the `sources` list in `dist/module.js.map`.

## Before reporting done

Report the release URL, what shipped (issue → PR), the checksum/version/signature results, which issues were commented on or closed, and the catalog form values with the testing guidance. If any step was skipped or failed, say which one.
