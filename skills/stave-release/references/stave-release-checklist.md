# Stave Release Checklist

## Repo Facts

- Repository root: detected at runtime via `git rev-parse --show-toplevel`
- Default branch: `main`
- Required remote: `origin`
- Version source: root `package.json`
- Release notes file: root `CHANGELOG.md`
- Release notes generator: `bunx --bun conventional-changelog-cli -p conventionalcommits -i CHANGELOG.md -s`
- Incremental changelog prerequisite: at least one semver git tag in `vX.Y.Z` form
- Release summaries must be validated against actual PR changes, PR description `Changes` sections, or the underlying git diff, not commit titles alone
- Expected release commit message: `chore: release x.y.z`
- Release delivery: PR against `main` on `origin` (never direct push)
- Post-merge: GitHub Actions workflow builds and publishes release artifacts automatically

## Release Sequence

1. Detect repo root: `git rev-parse --show-toplevel`
2. Capture the original checkout branch and path. The original checkout must end the flow on that same branch unless the user explicitly asks otherwise.
3. Read the current version from `package.json`.
4. Run `git status --short` to determine whether stash handoff is needed.
5. Always create a dedicated temporary release worktree.
   If the original checkout is dirty, transfer the state into the release worktree:
   ```bash
   git stash push --include-untracked -m "worktree-pr:release-x.y.z:<timestamp>"
   git worktree add -b release-x.y.z ../.worktrees/<repo>/release-x.y.z HEAD
   # apply stash inside the new worktree, verify diff landed there
   ```
   If the original checkout is clean:
   ```bash
   git worktree add -b release-x.y.z ../.worktrees/<repo>/release-x.y.z HEAD
   ```
   Record the temporary worktree path for cleanup after PR creation and do the rest of the release work there.
6. Verify `origin` exists: `git remote -v`
7. Find the most recent semver tag: `git tag --list 'v*' --sort=-version:refname | head -5`
8. Confirm whether the release is `patch` or `minor`, unless the user already specified the release type explicitly.
   - Prefer structured user input when the active runtime supports it.
   - If structured user input is unavailable, ask in plain chat and wait for the answer before continuing.
9. Bump the selected component in `package.json`.
   - `patch`: `x.y.z` -> `x.y.(z+1)`
   - `minor`: `x.y.z` -> `x.(y+1).0`
10. Review the release scope from the previous semver tag to `HEAD`.
   - `git log --first-parent --oneline <prev-tag>..HEAD`
   - `git diff --stat <prev-tag>..HEAD`
   - `git diff --name-only <prev-tag>..HEAD`
   - `git diff <prev-tag>..HEAD` for important hunks
   - If commit subjects or merge commits expose PR numbers, inspect the matching PRs with:
     - `gh pr view <number> --json title,body,files,url`
     - `gh pr diff <number>`
   - If a matching PR body contains a `Changes` section, treat those bullets as the preferred summary source for that PR.
   - Deduplicate PR `Changes` bullets against the actual diff before carrying them into release notes.
   - If the reviewed changes contain unexpected or unrelated work, stop before continuing.

11. Generate or refresh `CHANGELOG.md`:

```bash
bunx --bun conventional-changelog-cli -p conventionalcommits -i CHANGELOG.md -s
```

12. Treat `conventional-changelog` output as a draft baseline, not the final authority.
13. Inspect the newly generated top release section against the reviewed PR changes, extracted PR `Changes` bullets, and actual diff.
14. If the generated section drops or weakens validated PR `Changes` bullets, restore or merge them back into the top section.
15. If it is still missing meaningful bullets, append a concise 3–7 bullet summary derived from the reviewed PR changes and actual diff.
   - Summarize user-visible or architecture-significant outcomes, not file lists.
   - Keep the summary as flat outcome-focused bullets; do not use per-PR heading blocks such as `PR #123 — ...`.
   - If needed, add PR links in a separate `References` section instead.
16. Update `README.md` and other release-facing docs if the shipped behavior changed.
17. Run verification:
    - minimum: `bun run typecheck`
    - focused tests for changed areas
    - `bun test` or `bun run test:ci` when scope is broad
18. Stage and commit:

```bash
git add -A
git commit -m "chore: release x.y.z"
```

19. Push and open a PR:

```bash
git push origin <branch>
gh pr create --base main --title "chore: release x.y.z" --body "..."
```

20. Review the release PR diff after it is opened.
   - `gh pr diff <pr-number>` or `gh pr view <pr-number> --json files`
   - Confirm the PR body summary matches the actual diff.
   - Confirm the PR only contains the version bump, changelog/docs, and any intentionally included release metadata.
   - If unrelated code changes appear, stop and fix or report them before cleanup.

21. Clean up the temporary release worktree and verify the original checkout stayed on its original branch:

```bash
cd <original-checkout>
git worktree remove ../.worktrees/<repo>/release-x.y.z
git worktree prune
```

If the original checkout was switched for any reason, check it back out before stopping. In the common case, finish back on `main`.

## Repair Rules

- If the repo has no prior semver tags, stop and ask the user to create a baseline tag before proceeding.
- Do not assume `patch` by default. Confirm `patch` vs `minor` unless the user already made it explicit.
- If `package.json` already reflects the intended version, start from that state instead of bumping again.
- If `conventional-changelog` output needs cleanup, make the smallest explicit post-generation fix.
- Avoid release-note formatting that foregrounds per-PR headline blocks (`PR #... — ...`) unless the user explicitly requests that style.
- If PR numbers are not discoverable from commit history, fall back to the underlying git diff and continue the release review from there.
- If a PR has a usable `Changes` section but `conventional-changelog` does not reflect it, merge those bullets back into the generated top section before finishing.
- If the PR already exists and missed files, push an additional commit to the same branch (do not force-push unless the user explicitly requests it).
- If `origin` is missing, stop and report before committing.
- If the release PR diff shows unrelated files or a mismatched summary, correct the release notes or PR body before finishing.
- If verification fails, stop and surface the failure unless the user explicitly accepts releasing anyway.
- Do not create a local semver tag until the PR is merged. Tag on the merged `main` commit.
- Do not leave the original checkout on the temporary release branch. Preserve or restore the starting branch, usually `main`.
- Do not run `git worktree remove` from inside the same temporary release worktree you are trying to delete.
