---
name: stave-release
description: Release workflow for the Stave repository that bumps the patch version, generates release notes with `conventional-changelog`, and opens a pull request against `main`. Use when the user asks to cut the next patch release, ship the current changes as a versioned release, or prepare a release PR. After the PR merges, the repository's GitHub Actions workflow builds and publishes the release artifacts automatically.
---

# Stave Release

Use this skill to create a versioned release PR for the Stave repository.

Read `references/stave-release-checklist.md` for the exact sequence and repair rules.

## Workflow

1. Detect the repository root.
   - Run `git rev-parse --show-toplevel` to find the repo root. Never assume a hardcoded path.
   - All subsequent file reads and writes use this path as the base.

2. Inspect the release state before editing.
   - Read `package.json` to load the current version.
   - Run `git status --short` to confirm the working tree is clean (or note what is uncommitted).
   - Run `git remote -v` and confirm `origin` exists.
   - Run `git tag --list 'v*' --sort=-version:refname | head -5` to find the most recent semver tag. Incremental `conventional-changelog` generation depends on at least one prior tag.
   - If no prior semver tag exists, stop and explain that a baseline `vX.Y.Z` tag is required before incremental changelog generation is safe.

3. Bump only the patch version.
   - Increment `package.json` from `x.y.z` to `x.y.(z+1)`.
   - Do not bump if the working tree already reflects the intended release version.

4. Generate release notes.
   - Run: `bunx --bun conventional-changelog-cli -p conventionalcommits -i CHANGELOG.md -s`
   - Inspect the newly generated top section. If it is empty, heading-only, or missing meaningful bullets, automatically append a concise 3–7 bullet summary derived from the actual diff since the previous tag:
     - Use `git diff --stat <prev-tag>..HEAD` and `git diff --name-only <prev-tag>..HEAD` as signals.
     - Summarize user-visible or architecture-significant outcomes — not file lists.
   - Update `README.md` and any other release-facing docs that changed as part of the shipped behavior so docs and changelog stay aligned.
   - Review the generated notes before committing.

5. Verify before commit.
   - Run `bun run typecheck` at minimum.
   - Run focused tests for changed areas (`bun test` or `bun run test:ci` when scope is broad).
   - Report any verification that could not run.

6. Stage and commit directly on the current branch (or in a worktree if the working tree is unclean).
   - Stage: `git add -A`
   - Commit with a Conventional Commit: `chore: release x.y.z`
   - Do not amend a previously pushed release commit; always create a new commit.

7. Push the release branch and open a PR.
   - Push to `origin`: `git push origin <branch>`
   - Open a PR against `main` using `gh pr create --base main`.
   - PR title: `chore: release x.y.z`
   - PR body must include: a bullet summary of shipped changes, the verification commands run and their results, and the `🤖 Generated with Claude Code` footer.
   - **Never push directly to `main`.** All releases land via PR.

8. Report the outcome.
   - State the new version.
   - State the release commit hash and message.
   - State the PR URL.
   - State which verification commands ran and their results.
   - Note that GitHub Actions will build and publish release artifacts after the PR merges.

## Guardrails

- **Never push directly to `main`.** All releases land via PR.
- Never hardcode a repository path. Always derive it with `git rev-parse --show-toplevel`.
- Do not bump the version twice if the working tree already reflects the intended release.
- Do not create a non-Conventional commit.
- Do not hand-write release notes when `conventional-changelog` is the required path.
- Do not silently skip changelog review or release-facing doc updates when shipped behavior changed.
- Do not create a local semver tag before the PR is merged. Tag the merged `main` commit after merge.
- If verification fails, stop and surface the failure unless the user explicitly accepts releasing anyway.
