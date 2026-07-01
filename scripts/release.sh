#!/usr/bin/env bash
#
# release.sh — helper for cutting a new plugin release.
#
# The release is tag-driven: pushing a tag `vX.Y.Z` triggers
# `.github/workflows/release.yml` (build + sign + provenance + GitHub release).
# `release.yml` verifies that the tag equals the `package.json` version, so the
# two must always match. This script keeps them in sync and follows the repo
# convention of a `release/vX.Y.Z` PR that is reviewed and merged before tagging.
#
# Usage:
#   scripts/release.sh prepare <version>   # step 1: branch + bump + commit + push, then open a PR
#   scripts/release.sh tag <version>       # step 2: after the release PR merges, tag main to publish
#
# Example (releasing 1.5.3):
#   scripts/release.sh prepare 1.5.3       # edit CHANGELOG when prompted, push, open & merge the PR
#   scripts/release.sh tag 1.5.3           # pushes tag v1.5.3 -> release workflow runs
#
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }

# X.Y.Z, no leading "v"
validate_version() {
  local v="$1"
  [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must be semver X.Y.Z (got '$v')"
}

pkg_version() {
  node -p "require('./package.json').version"
}

require_clean_tree() {
  git diff --quiet && git diff --cached --quiet || die "working tree is not clean; commit or stash first"
}

cmd="${1:-}"
version="${2:-}"

[[ -n "$cmd" && -n "$version" ]] || die "usage: scripts/release.sh {prepare|tag} <version>"
validate_version "$version"

# Always operate from the repo root.
cd "$(dirname "$0")/.."

tag="v${version}"

case "$cmd" in
  prepare)
    require_clean_tree
    git fetch origin --quiet
    branch="release/${tag}"
    echo "==> Creating ${branch} from origin/main"
    git checkout -b "$branch" origin/main

    echo "==> Bumping package.json to ${version}"
    npm version "$version" --no-git-tag-version --allow-same-version >/dev/null

    cat <<EOF

==> Now edit CHANGELOG.md: add a new section at the top:

    ## [${version}](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/${tag}) (YYYY-MM-DD)

    ### Features / Bug Fixes / Chores
    * ... describe the change ... (#issue, PR #nnn)

Press Enter to open CHANGELOG.md in \${EDITOR:-vi}, or Ctrl-C to edit it yourself.
EOF
    read -r _
    "${EDITOR:-vi}" CHANGELOG.md

    git add package.json CHANGELOG.md
    git commit -m "chore(release): bump version to ${version}"
    git push -u origin "$branch"

    echo
    echo "==> Done. Open the PR and merge it (squash), then run:"
    echo "      scripts/release.sh tag ${version}"
    ;;

  tag)
    echo "==> Fetching latest main"
    git fetch origin --quiet
    remote_version="$(git show origin/main:package.json | node -p "JSON.parse(require('fs').readFileSync(0)).version")"
    [[ "$remote_version" == "$version" ]] || \
      die "origin/main package.json is ${remote_version}, not ${version} — is the release PR merged?"

    git rev-parse -q --verify "refs/tags/${tag}" >/dev/null && die "tag ${tag} already exists"

    local_sha="$(git rev-parse origin/main)"
    echo "==> Tagging ${local_sha} as ${tag}"
    git tag -a "$tag" "$local_sha" -m "Release ${tag}"
    git push origin "$tag"

    echo "==> Pushed ${tag}. The release workflow will build, sign, and publish the GitHub release."
    ;;

  *)
    die "unknown command '${cmd}' (expected 'prepare' or 'tag')"
    ;;
esac
