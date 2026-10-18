---
name: weathermap-pr-review
description: Review, fix up and land pull requests on the Network Weathermap plugin repo, including contributor PRs from forks, the cubic AI review threads, stacked PRs and failing Grafana API compatibility checks. Use this whenever the user asks to review a PR, "address the AI review", "resolve the review comments", "approve the CI", "land/merge #N", "rebase the stacked PR", or to continue work on an open PR or the issue it fixes.
---

# Reviewing and landing PRs

Repo: `allamiro/grafana-network-weathermap-ng`, default branch `main`, squash merges only. The user is the maintainer (`allamiro`). Never add `Co-Authored-By: Claude` or any AI attribution to commits, squash merges or PR bodies.

## 1. Get the full picture first

```bash
gh pr view N --json title,body,state,isDraft,mergeable,maintainerCanModify,headRefName,headRepositoryOwner,commits \
  --jq '{title,state,isDraft,mergeable,maintainerCanModify,headRefName,owner:.headRepositoryOwner.login}'
gh pr diff N
gh pr checks N
```

Review threads (inline comments, resolved state) are only in GraphQL:

```bash
gh api graphql -F n=N -f query='query($n:Int!){repository(owner:"allamiro",name:"grafana-network-weathermap-ng"){pullRequest(number:$n){
  reviewThreads(first:50){nodes{id isResolved path line comments(first:10){nodes{databaseId author{login} body}}}}
  reviews(last:10){nodes{author{login} state body}}}}}'
```

Also read the linked issue (`gh issue view`). Fixes here often have a wider impact than the title says, and the release notes need it.

## 2. Reproduce the verification locally

```bash
git fetch origin pull/N/head:pr-N && git checkout pr-N   # works for forks too
npm run typecheck && npm run lint && npm run test:ci
npx prettier --check <changed files>    # not the whole tree: other files have pre-existing drift
```

If jest reports `jest-environment-jsdom cannot be found`, `node_modules` is missing: run `npm ci`, then `npx patch-package` (the `brace-expansion` patch in `patches/` must apply, and npm may block the postinstall).

For a bug fix, prove the PR's tests catch the bug. Put the old version of the fixed file back and expect failures:

```bash
git checkout origin/main -- src/path/Fixed.tsx && npx jest <new tests>   # should FAIL
git checkout HEAD -- src/path/Fixed.tsx                                   # restore
```

A test that passes on both is not a regression test. Say so in the review. The `weathermap-regression-tests` skill covers writing ones that do fail.

## 3. CI on fork PRs

- **`action_required` runs:** fork workflows wait for maintainer approval. Look at the diff before approving: approved runs execute the contributor's code. Be suspicious of changes to `.github/workflows/`, `package.json` scripts, `scripts/` or `.config/`. Then:
  `gh api -X POST repos/allamiro/grafana-network-weathermap-ng/actions/runs/<run-id>/approve` for each run (`gh run list --branch <headRefName>`).
- **"Check Grafana API compatibility (latest)" fails with `Resource not accessible by integration`:** that's the Levitate sticky-comment step being denied a fork token, not an incompatibility. #379 fixed it on `main`, so a branch based before #379 shows it. Bring the branch up to date with `gh pr update-branch N` (needs `maintainerCanModify`), then approve the new runs.
- **The Grafana 11.0.0 / 12.0.0 / 13.1.0 API checks** are real and blocking: the plugin supports `>=11.0.0`. Read the Levitate output, don't bypass it.
- To wait without polling: `gh pr checks N --watch --interval 20` in the background.

## 4. The cubic AI review

`cubic-dev-ai` posts each finding as an inline review thread with a priority (P1–P3) and often a `suggestion` block. Over REST its login is `cubic-dev-ai[bot]`. Treat each finding as a claim to check, not an order:

1. Decide whether it's valid by reading the code it points at. cubic is often right about tests that pass vacuously and about bare `#123` refs in docs, and sometimes wrong about intent.
2. **Valid:** fix it in a commit, push, then reply on the thread with what changed and the short SHA.
   **Not valid / out of scope:** reply with the concrete reason (and open a follow-up issue if it's real but belongs elsewhere).
3. Resolve the thread either way.

```bash
# reply (comment id = databaseId of the thread's first comment)
gh api -X POST repos/allamiro/grafana-network-weathermap-ng/pulls/N/comments/<comment-id>/replies \
  -f body="Fixed in abc1234: <what changed>."
# resolve (thread id = PRRT_... from the GraphQL query)
gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:"PRRT_..."}){thread{isResolved}}}'
```

After pushing, wait for cubic's re-review on the new head commit. "All reported issues were addressed" or "No issues found" is the signal to continue. Re-run the GraphQL query and confirm no unresolved threads remain.

## 5. Reviewing a contributor's PR

Thank them, then be concrete:

- **What I verified:** say the test fails on `main` and passes on the branch, name the root cause, and confirm typecheck/lint/suite pass.
- **Wider impact:** if the bug affects more than the PR says, file an issue and ask for `Closes #N` in the description.
- **Requested changes:** numbered, small, with inline `suggestion` blocks so they can apply them in one click.

If they've gone quiet and `maintainerCanModify` is true, you may push small agreed fixes to their branch: `git push https://github.com/<owner>/<repo>.git HEAD:<headRefName>`. Say so in a comment.

Approve with `gh pr review N --approve --body ...` once every requested change is in and CI is green. That replaces an earlier "changes requested" review.

## 6. Merging

```bash
gh pr merge N --squash --subject "<PR title> (#N)" --body "<short summary, no co-author trailers>"
```

- Pass `--body` explicitly. Without it GitHub copies every branch commit's `Co-authored-by:` trailer, including AI ones, into the squash commit on `main`.
- Add `--delete-branch` for branches in this repo, not for forks.
- `Closes #N` in the PR body closes the issue on merge. The repo still comments on the issue with the release link once it ships (see `weathermap-release`).
- Merging is outward-facing: merge only when the user has asked you to land it.

## 7. Stacked PRs

When PR B is built on PR A's commits and A is squash-merged, B's branch still carries A's original commits. Replay only B's own commits:

```bash
git fetch origin
git checkout B-branch
git rebase --onto origin/main <last commit of A on B's branch>
git diff --stat origin/main..HEAD          # should show only B's files
npm run test:ci
git push --force-with-lease origin B-branch
gh pr ready N                               # if it was a draft waiting on A
```

Update B's description to drop the "stacked on" note, so reviewers don't follow stale instructions.

## Before reporting done

Say what you verified locally (with test counts), which threads you fixed and which you answered (and why), the CI state on the final head commit, and whether anything is merged or still waiting on the user.
