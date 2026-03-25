# Stave Release Checklist

## Repo Facts

- Repository root: detected at runtime via `git rev-parse --show-toplevel`
- Default branch: `main`
- Required remote: `origin`
- Version source: root `package.json`
- Release notes file: root `CHANGELOG.md`
- Release notes generator: `bunx --bun conventional-changelog-cli -p conventionalcommits -i CHANGELOG.md -s`
- Incremental changelog prerequisite: at least one semver git tag in `vX.Y.Z` form
- Expected release commit message: `chore: release x.y.z`
- Release delivery: PR against `main` on `origin` (never direct push)
- Post-merge: GitHub Actions workflow builds and publishes release artifacts automatically

## Release Sequence

1. Detect repo root: `git rev-parse --show-toplevel`
2. Read the current version from `package.json`.
3. Run `git status --short` — working tree should be clean before starting a release.
4. Verify `origin` exists: `git remote -v`
5. Find the most recent semver tag: `git tag --list 'v*' --sort=-version:refname | head -5`
6. Bump only the patch component in `package.json`.
7. Generate or refresh `CHANGELOG.md`:

```bash
bunx --bun conventional-changelog-cli -p conventionalcommits -i CHANGELOG.md -s
```

8. Inspect the newly generated top release section.
9. If it is missing meaningful bullets, append a concise 3–7 bullet summary derived from the actual diff:
   - `git diff --stat <prev-tag>..HEAD`
   - `git diff --name-only <prev-tag>..HEAD`
   - Summarize user-visible or architecture-significant outcomes, not file lists.
10. Update `README.md` and other release-facing docs if the shipped behavior changed.
11. Run verification:
    - minimum: `bun run typecheck`
    - focused tests for changed areas
    - `bun test` or `bun run test:ci` when scope is broad
12. Stage and commit:

```bash
git add -A
git commit -m "chore: release x.y.z"
```

13. Push and open a PR:

```bash
git push origin <branch>
gh pr create --base main --title "chore: release x.y.z" --body "..."
```

## Repair Rules

- If the repo has no prior semver tags, stop and ask the user to create a baseline tag before proceeding.
- If `package.json` already reflects the intended version, start from that state instead of bumping again.
- If `conventional-changelog` output needs cleanup, make the smallest explicit post-generation fix.
- If the PR already exists and missed files, push an additional commit to the same branch (do not force-push unless the user explicitly requests it).
- If `origin` is missing, stop and report before committing.
- If verification fails, stop and surface the failure unless the user explicitly accepts releasing anyway.
- Do not create a local semver tag until the PR is merged. Tag on the merged `main` commit.
