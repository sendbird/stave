---
name: stave-release
description: Release workflow for the Stave repository that confirms whether the next release is patch or minor before bumping the version, reviews the actual PR changes and PR description `Changes` sections in the release scope instead of relying on commit titles alone, generates release notes with `conventional-changelog`, and opens a pull request against `main` from a dedicated temporary release worktree so the user's original checkout stays on its original branch. Use when the user asks to cut the next release, ship the current changes as a versioned release, or prepare a release PR. After the PR merges, the repository's GitHub Actions workflow builds and publishes the release artifacts automatically.
---

# Stave Release

Use this skill to create a versioned release PR for the Stave repository.

Read `references/stave-release-checklist.md` for the exact sequence and repair rules.

## Workflow

1. Detect the repository root.
   - Run `git rev-parse --show-toplevel` to find the repo root. Never assume a hardcoded path.
   - All subsequent file reads and writes use this path as the base.
   - Capture the original checkout path and branch up front. The original checkout must end the flow on that same branch unless the user explicitly asks otherwise.

2. Inspect the release state before editing.
   - Read `package.json` to load the current version.
   - Run `git status --short` to confirm the working tree is clean (or note what is uncommitted).
   - Run `git remote -v` and confirm `origin` exists.
   - Run `git tag --list 'v*' --sort=-version:refname | head -5` to find the most recent semver tag. Incremental `conventional-changelog` generation depends on at least one prior tag.
   - If no prior semver tag exists, stop and explain that a baseline `vX.Y.Z` tag is required before incremental changelog generation is safe.

3. Confirm the release bump type and update the version.
   - Ask the user whether this release is `patch` or `minor` before editing `package.json`, unless the user already specified the version bump explicitly.
   - Prefer structured user input when the active runtime supports it. If structured user input is unavailable, ask in plain chat and wait for the answer before continuing.
   - For `patch`, increment `package.json` from `x.y.z` to `x.y.(z+1)`.
   - For `minor`, increment `package.json` from `x.y.z` to `x.(y+1).0`.
   - Do not bump if the working tree already reflects the intended release version.

4. Review the shipped changes before writing the release summary.
   - Treat commit titles as hints only. They are not sufficient evidence of shipped behavior.
   - Build the release scope from the previous semver tag to `HEAD`.
   - Inspect the actual diff with:
     - `git log --first-parent --oneline <prev-tag>..HEAD`
     - `git diff --stat <prev-tag>..HEAD`
     - `git diff --name-only <prev-tag>..HEAD`
     - `git diff <prev-tag>..HEAD` for important hunks
   - When commit subjects or merge commits expose PR numbers, inspect the matching PRs with `gh pr view <number> --json title,body,files,url` and `gh pr diff <number>`.
   - If a matching PR body contains a `Changes` section, treat those bullets as the preferred human-written summary source for that PR. Use PR titles only as a fallback when no usable `Changes` section exists.
   - Use this review to identify user-visible outcomes, risky migrations, doc impacts, and anything the release PR body must call out.
   - Deduplicate PR `Changes` bullets against the actual diff before carrying them into release notes.
   - If the reviewed changes contain unexpected or unrelated work, stop and surface that before continuing.

5. Generate release notes.
   - Run: `bunx --bun conventional-changelog-cli -p conventionalcommits -i CHANGELOG.md -s`
   - Treat `conventional-changelog` output as a draft baseline, not the final authority.
   - Inspect the newly generated top section against the reviewed PR changes and actual diff, not just commit subjects.
   - Reconcile the top section with validated PR `Changes` bullets after generation. Do not let `conventional-changelog` overwrite useful `Changes` content that better describes the shipped work.
   - If it is empty, heading-only, or missing meaningful bullets, automatically append or restore a concise 3–7 bullet summary derived from the reviewed PR changes and actual diff since the previous tag:
     - Summarize user-visible or architecture-significant outcomes — not file lists.
     - Use a flat outcome-first bullet list. Do not format this section as per-PR headings like `PR #123 — ...`.
     - If PR traceability is needed, add a separate `References` list of PR links at the end instead of headline-style PR blocks.
   - Update `README.md` and any other release-facing docs that changed as part of the shipped behavior so docs and changelog stay aligned.
   - Review the generated notes before committing.

6. Verify before commit.
   - Run `bun run typecheck` at minimum.
   - Run focused tests for changed areas (`bun test` or `bun run test:ci` when scope is broad).
   - Report any verification that could not run.

7. Create a dedicated temporary release worktree and commit there.
   - Always create the release branch in a temporary worktree at `../.worktrees/<repo>/release-x.y.z`. Do not leave the user's original checkout on the release branch.
   - If the original working tree is unclean:
     - `git stash push --include-untracked -m "worktree-pr:release-x.y.z:<timestamp>"`
     - `git worktree add -b release-x.y.z ../.worktrees/<repo>/release-x.y.z HEAD`
     - Apply the stash inside the new worktree and verify the diff landed there.
   - If the original working tree is clean:
     - `git worktree add -b release-x.y.z ../.worktrees/<repo>/release-x.y.z HEAD`
   - Record the temporary worktree path for cleanup in step 8 and run all remaining release edits from that worktree.
   - Stage: `git add -A`
   - Commit with a Conventional Commit: `chore: release x.y.z`
   - Do not amend a previously pushed release commit; always create a new commit.

8. Push the release branch and open a PR.
   - Push to `origin`: `git push origin <branch>`
   - Open a PR against `main` using `gh pr create --base main`.
   - PR title: `chore: release x.y.z`
   - PR body must include: a bullet summary of shipped changes, the verification commands run and their results, and an agent-generation footer that matches the active runtime.
   - After opening the PR, review the actual PR diff with `gh pr diff <pr-number>` or `gh pr view <pr-number> --json files`.
   - Confirm the PR body summary matches the real diff and that the PR contains only the version bump, changelog/docs, and any intentionally included release metadata.
   - If unrelated code changes appear in the release PR, stop and report them before cleanup.
   - **Never push directly to `main`.** All releases land via PR.

9. Clean up the temporary worktree and restore the original checkout state.
   - If push and PR creation in step 8 succeeded and the temporary worktree is clean, remove it:
     - First leave the temporary release worktree and return to the recorded original checkout (or another safe cwd outside the target worktree).
     - Then run: `git worktree remove ../.worktrees/<repo>/release-x.y.z`
   - If cleanup fails only because the shell is still inside the target worktree, treat that as an execution mistake: change back to the recorded original checkout and retry once before reporting failure.
   - Run `git worktree prune` to remove stale metadata.
   - Verify the original checkout is still on its original branch. If it was switched for any reason, check it back out before finishing. For the common case, that means ending back on `main`.
   - Never remove a dirty temporary worktree.

10. Report the outcome.
   - State the new version.
   - State the release commit hash and message.
   - State the PR URL.
   - State which verification commands ran and their results.
   - State whether a temporary worktree was created and, if so, whether it was removed or kept.
   - State which branch the original checkout ended on after cleanup.
   - Note that GitHub Actions will build and publish release artifacts after the PR merges.

## Guardrails

- **Never push directly to `main`.** All releases land via PR.
- Never hardcode a repository path. Always derive it with `git rev-parse --show-toplevel`.
- Do not assume a patch bump by default. Confirm `patch` vs `minor` with the user unless the request already makes the release type explicit.
- Do not bump the version twice if the working tree already reflects the intended release.
- Do not hardcode a Claude-only user-input mechanism in shared release instructions. Use structured user input when the runtime supports it, and plain chat fallback otherwise.
- Do not create a non-Conventional commit.
- Do not hand-write release notes when `conventional-changelog` is the required path.
- Do not rely on commit titles alone when drafting release notes or the release PR summary; review the actual PR changes or underlying git diff.
- Do not ignore a PR description `Changes` section when it exists and is consistent with the diff; treat it as a preferred summary source.
- Do not let `conventional-changelog` overwrite validated `Changes` bullets from PR descriptions without reconciling them back into the final top section.
- Do not default to release-note headings in the form `PR #... — ...`; prefer outcome-focused bullets and optional reference links.
- Do not silently skip changelog review or release-facing doc updates when shipped behavior changed.
- Do not skip reviewing the release PR diff after opening it.
- Do not create a local semver tag before the PR is merged. Tag the merged `main` commit after merge.
- If verification fails, stop and surface the failure unless the user explicitly accepts releasing anyway.
- Do not leave a temporary release worktree behind after a successful PR creation; always remove it and run `git worktree prune`.
- Do not leave the user's original checkout on `release-x.y.z`; restore or preserve the original branch, usually `main`.
- Do not run `git worktree remove` from inside the same temporary release worktree you are trying to delete.
