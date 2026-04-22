---
name: stave-worktree-pr-flow
description: Ship the full current in-progress work as a PR in one pass. If already running inside a workspace-linked `git worktree` (for example under `.stave/workspaces/*`), reuse that same worktree in place. Otherwise move the dirty state into a dedicated temporary worktree, commit with a Conventional Commit message, push, open a GitHub pull request, and clean up the temporary worktree unless the user asks to keep it. Use for prompts like "worktree 만들어서 PR", "현재 작업 PR로 올려줘", or "spin this dirty tree into a PR branch".
compatible-tools: [claude, codex]
category: workflow
test-prompts:
  - "현재 작업중인 변경들 새 worktree로 옮겨서 커밋 푸시 PR까지 해줘"
  - "workspace에서 작업중인 상태 그대로 커밋 푸시하고 PR 만들어줘"
  - "worktree 하나 만들어서 여기 변경사항들 PR로 올려줘"
  - "spin the dirty tree into a worktree branch and open a PR"
---

# Worktree PR Flow

Repository-local skill for taking the full current working state and shipping it as a PR, while reusing the current worktree when already inside a workspace worktree.

## Workflow

1. Confirm the intended scope.
   - Default to the full current `git status`, including untracked files, plus the current `HEAD`.
   - If the user did not supply a branch name, infer one from the request or the changed area. Ask one concise question only if the inferred name would be misleading.
   - If the user did not supply a commit message or PR title, infer them from the actual diff. Keep the commit message Conventional Commit compliant.

2. Inspect the repo and choose execution mode before moving anything.
   - Capture `git branch --show-current`, `git status --short --branch`, `git rev-parse --short HEAD`, and `git rev-parse --show-toplevel`.
   - Capture `pwd -P` and `git rev-parse --git-common-dir` to detect whether the current checkout is already a linked worktree.
   - Record the original checkout path up front. If this flow creates a temporary worktree, use that original checkout (or another non-target worktree) as the cleanup cwd in step 8.
   - Check whether the current branch is a protected or shared branch such as `main` or `master`.
   - Run `git worktree list --porcelain`.
   - If the current top-level path is under `.stave/workspaces/` or the checkout is already a linked worktree, set mode to `reuse-current-worktree` and do not create another worktree by default.
   - Otherwise set mode to `create-temporary-worktree`, then reconcile any existing worktree for the intended branch and run `git worktree prune` when stale metadata is present.
   - Check `git remote -v` and confirm a writable GitHub remote exists.
   - Check `gh auth status` before planning PR creation.
   - If the current branch already has local commits that should not be part of the PR, stop and clarify instead of guessing a partial move.

3. Move the dirty state into a dedicated worktree safely (only in `create-temporary-worktree` mode).
   - Skip this step entirely in `reuse-current-worktree` mode.
   - Use a unique stash message such as `worktree-pr:<branch>:<timestamp>`.
   - Run `git stash push --include-untracked -m "<message>"` only when the current worktree is dirty.
   - Use a deterministic temporary worktree root instead of ad hoc sibling folders, for example `../.worktrees/<repo>/<branch>`.
   - Create the new worktree from the current `HEAD`, not from a guessed base branch:
     `git worktree add -b <branch> ../.worktrees/<repo>/<branch> HEAD`
   - Apply the captured stash inside the new worktree and verify the diff landed there.
   - Leave the original worktree clean unless the user explicitly asks to restore the changes there too.
   - If stash apply or pop conflicts, stop and surface the conflict instead of hiding it.

4. Validate the target changes in the execution worktree.
   - Use the execution worktree selected in step 2:
     - `reuse-current-worktree` mode: current workspace worktree
     - `create-temporary-worktree` mode: newly created temporary worktree
   - Re-run `git status --short --branch` inside the execution worktree.
   - Inspect the diff so the commit contains exactly the intended work.
   - Run the repo's configured formatter for any edited source files when one exists. If the repo has no formatter, note that explicitly and continue.
   - Run the minimum meaningful verification for the changed area. Use the repo's standard typecheck or focused tests when available, and report any skipped verification.

5. Commit from the execution worktree.
   - Stage intentionally with `git add -A` unless the user asked for a narrower commit.
   - Use a Conventional Commit message.
   - If the combined diff is not a coherent single commit, stop and ask before creating a misleading one-commit PR.
   - Confirm `git status --short` is clean after the commit.

6. Push the branch.
   - Push with upstream tracking, usually `git push -u origin <branch>`.
   - If the remote branch already exists and history was rewritten locally, use `--force-with-lease`, never plain `--force`.
   - Prefer the remote that backs GitHub PRs. Do not push unrelated remotes, tags, or release refs in this workflow.

7. Create the PR.
   - Prefer `gh pr create --base <base> --head <branch> --title <title> --body <body>`.
   - Derive the base branch from the repo default branch unless the user requested another target.
   - **PR title must follow Conventional Commits format**: `type(scope): description` using the same type and scope as the commit message. The subject (description part) must be lowercase — never capitalise the first letter. Examples: `fix(workspace): reuse root node_modules in worktrees`, `feat(ui): add dark mode toggle`. Do not use plain natural-language titles.
   - Keep the PR body concise and outcome-focused: summary, key changes, verification.
   - If `gh` is unavailable or unauthenticated, stop after push and tell the user exactly what blocked PR creation.

8. Clean up the temporary worktree (only in `create-temporary-worktree` mode).
   - Skip cleanup in `reuse-current-worktree` mode; the current workspace worktree must stay intact.
   - If push and PR creation succeeded and the temporary worktree is clean, first leave the temporary worktree and return to the original checkout (or another safe cwd outside the target worktree).
   - Then remove it by default with `git worktree remove <path>`.
   - Keep it only when the user explicitly wants to continue working there.
   - If cleanup fails only because the shell is still inside the target worktree, treat that as an execution mistake: change back to the recorded original checkout and retry once before reporting failure.
   - Run `git worktree prune` after removal so the repo metadata stays clean.
   - Never remove a dirty worktree.

9. Report the outcome.
   - Give the execution mode (`reuse-current-worktree` or `create-temporary-worktree`).
   - Give the execution worktree path.
   - Give the branch name.
   - Give the commit hash and commit message.
   - Give the pushed remote.
   - Give the PR URL.
   - Say whether a temporary worktree was created and, if created, whether it was removed or kept.
   - Mention any verification not run.

## Guardrails

- Do not destroy or reset the user's original worktree state.
- Do not drop untracked files when moving the dirty state.
- Do not create a non-Conventional commit.
- Do not use a plain natural-language PR title. The PR title must follow the same Conventional Commits format as the commit message (`type(scope): description`, lowercase subject).
- Do not silently create the PR against the wrong base branch.
- Do not use `git push --force`; use `--force-with-lease` when a rewrite is required.
- Do not create a nested temporary worktree when already running in a workspace-linked worktree unless the user explicitly requests that.
- Do not create a second worktree at an occupied path without reconciling it first.
- Do not scatter temporary worktrees as unnamed sibling directories; keep them under one deterministic worktree root.
- Do not leave stale worktree registrations behind after a successful temporary-flow run.
- Do not run `git worktree remove <path>` from inside the same worktree path you are trying to remove.
- Do not remove the current workspace worktree as part of cleanup.
- Do not create an empty commit or empty PR when there are no dirty changes and no unpublished commits.
