# Workspace PR Status

_Added 2026-03-30_

## Overview

Each non-default workspace maps 1:1 to a git worktree branch.
This feature fetches the GitHub PR associated with that branch, derives a single status enum, and surfaces it in three places:

1. **Sidebar** — workspace row icon reflects PR lifecycle state with semantic color
2. **Top bar** — "Create PR" button becomes a PR status hub with contextual actions
3. **Right-rail information panel** — workspace details view shows the live branch PR beside manually stored PR references
4. **Continue handoff** — merged or closed workspaces can spin up a fresh follow-up workspace with a generated continuation brief attached to the first task draft

Default workspaces (typically `main`) are excluded; they never carry a PR.

## Status Model

### Enum

```ts
type WorkspacePrStatus =
  | "no_pr" // branch has no associated PR
  | "draft" // PR is open in draft mode
  | "review_required" // open, awaiting first approval
  | "changes_requested" // reviewer requested changes
  | "checks_pending" // CI / status checks still running
  | "checks_failed" // required checks failed
  | "merge_conflict" // GitHub reports CONFLICTING mergeable state
  | "behind_base" // head is behind the base branch
  | "ready_to_merge" // approved + checks pass + mergeable
  | "merged" // PR was merged
  | "closed_unmerged"; // PR closed without merge
```

### Derivation Priority

Raw GitHub fields → single enum, evaluated top to bottom (first match wins):

| Priority | Condition                                     | Status              |
| -------- | --------------------------------------------- | ------------------- |
| 1        | `mergedAt` set or `state = MERGED`            | `merged`            |
| 2        | `state = CLOSED`                              | `closed_unmerged`   |
| 3        | `isDraft = true`                              | `draft`             |
| 4        | `mergeable = CONFLICTING`                     | `merge_conflict`    |
| 5        | `mergeStateStatus = BEHIND`                   | `behind_base`       |
| 6        | `reviewDecision = CHANGES_REQUESTED`          | `changes_requested` |
| 7        | `checksRollup = FAILURE`                      | `checks_failed`     |
| 8        | `checksRollup = PENDING`                      | `checks_pending`    |
| 9        | `reviewDecision` is empty / `REVIEW_REQUIRED` | `review_required`   |
| 10       | everything else                               | `ready_to_merge`    |

### Raw GitHub Fields

Fetched via `gh pr view --json`:

| Field                                        | Source                                                             |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `number`, `title`, `state`, `isDraft`, `url` | PR metadata                                                        |
| `reviewDecision`                             | `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`, or empty       |
| `mergeable`                                  | `MERGEABLE`, `CONFLICTING`, `UNKNOWN`                              |
| `mergeStateStatus`                           | `BEHIND`, `BLOCKED`, `CLEAN`, `DIRTY`, `DRAFT`, ...                |
| `statusCheckRollup`                          | Array of CheckRun/StatusContext objects → derived to single rollup |
| `mergedAt`, `baseRefName`, `headRefName`     | Merge and branch info                                              |

The `statusCheckRollup` array is collapsed into a single `"SUCCESS" | "FAILURE" | "PENDING" | null` on the main process side before reaching the renderer.

## Visual Mapping

### Icons (Lucide)

| Status              | Icon                        | Color Token   |
| ------------------- | --------------------------- | ------------- |
| `no_pr`             | `GitPullRequestCreateArrow` | `muted`       |
| `draft`             | `GitPullRequestDraft`       | `muted`       |
| `review_required`   | `GitPullRequest`            | `primary`     |
| `changes_requested` | `GitPullRequest`            | `destructive` |
| `checks_pending`    | `GitPullRequest`            | `warning`     |
| `checks_failed`     | `GitPullRequest`            | `destructive` |
| `merge_conflict`    | `GitCompareArrows`          | `destructive` |
| `behind_base`       | `GitBranch`                 | `warning`     |
| `ready_to_merge`    | `GitMerge`                  | `success`     |
| `merged`            | `GitMerge`                  | `success`     |
| `closed_unmerged`   | `GitPullRequestClosed`      | `muted`       |

### Color Tokens

All five semantic tokens are defined in `globals.css` and mapped in Tailwind:

| Token         | Usage                      | Tailwind Class          |
| ------------- | -------------------------- | ----------------------- |
| `muted`       | Inactive / terminal states | `text-muted-foreground` |
| `primary`     | Neutral-active states      | `text-primary`          |
| `warning`     | Attention needed           | `text-warning`          |
| `destructive` | Blocked / failing          | `text-destructive`      |
| `success`     | Ready / merged             | `text-success`          |

## Architecture

### Data Flow

```
gh pr view --json ...
       │
       ▼
┌─────────────────┐     IPC: scm:get-pr-status
│  Electron Main   │ ◄──────────────────────────── Renderer
│  (scm.ts)        │                                  │
│  • run gh CLI    │                                  │
│  • parse JSON    │     { ok, pr: GitHubPrPayload }  │
│  • derive checks │ ────────────────────────────►    │
│    rollup        │                                  ▼
└─────────────────┘                          ┌───────────────┐
                                             │  app.store.ts  │
                                             │  workspacePr   │
                                             │  InfoById      │
                                             └──────┬────────┘
                                                    │
                                         ┌──────────┴──────────┐
                                         │                     │
                                    Sidebar icon         TopBar PR Hub
                                  (PrStatusIcon)      (DropdownMenu +
                                                       creation dialog)
```

### File Map

| Layer              | File                                                  | Role                                                                                                          |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Types & derivation | `src/lib/pr-status.ts`                                | `WorkspacePrStatus`, `GitHubPrPayload`, `derivePrStatus()`, visual config, action config                      |
| IPC handlers       | `electron/main/ipc/scm.ts`                            | `scm:get-pr-status`, `scm:get-pr-status-for-url`, `scm:set-pr-ready`, `scm:merge-pr`, `scm:update-pr-branch` |
| Preload bridge     | `electron/preload.ts`                                 | `getPrStatus`, `getPrStatusForUrl`, `setPrReady`, `mergePr`, `updatePrBranch`                                 |
| Window API types   | `src/types/window-api.d.ts`                           | Type definitions for the 5 PR-related methods                                                                 |
| Store              | `src/store/app.store.ts`                              | `workspacePrInfoById`, `fetchWorkspacePrStatus`, `fetchAllWorkspacePrStatuses`, `continueWorkspaceFromSummary` |
| Icon component     | `src/components/layout/PrStatusIcon.tsx`              | Reusable icon renderer: status → Lucide icon + color                                                          |
| Sidebar            | `src/components/layout/ProjectWorkspaceSidebar.tsx`   | Renders `PrStatusIcon` for non-default workspaces                                                             |
| TopBar hub         | `src/components/layout/TopBarOpenPR.tsx`              | PR status badge, dropdown actions, creation dialog, and continue entry for completed workspaces               |
| Continue dialog    | `src/components/layout/ContinueWorkspaceDialog.tsx`   | New workspace handoff dialog for completed PR workspaces                                                      |
| Information panel  | `src/components/layout/WorkspaceInformationPanel.tsx` | Shows the current branch PR plus related manual PR URLs resolved through GitHub metadata when available       |
| Continue helper    | `src/lib/workspace-continue.ts`                       | Builds the continuation markdown brief and `.stave/context/...` file path                                     |

### IPC Handlers

| Handler                     | CLI Command                                    | Purpose                                            |
| --------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `scm:get-pr-status`         | `gh pr view --json ...`                        | Fetch PR metadata + derive checks rollup           |
| `scm:get-pr-status-for-url` | `gh pr view <url> --json ...`                  | Fetch metadata for a manually linked GitHub PR URL |
| `scm:set-pr-ready`          | `gh pr ready`                                  | Convert draft → ready for review                   |
| `scm:merge-pr`              | `gh pr merge --squash --delete-branch`         | Squash-merge and delete remote branch              |
| `scm:update-pr-branch`      | `git fetch origin && git rebase origin/<base>` | Rebase head onto latest base                       |

All handlers check `gh auth status` before executing.

## Polling Strategy

| Context                   | Interval   | Trigger                      |
| ------------------------- | ---------- | ---------------------------- |
| Active workspace (TopBar) | 60 seconds | `useEffect` interval         |
| All workspaces (Sidebar)  | 5 minutes  | `useEffect` interval         |
| Manual                    | On demand  | Dropdown "Refresh" item      |
| After action              | Immediate  | Post-create/merge/mark-ready |

PR info is **transient state** — not persisted in `RecentProjectState` or SQLite.
Each session fetches fresh from GitHub on mount.

## TopBar Hub Behavior

The top bar button changes based on status:

| Status    | Button Appearance                                  | Click Behavior                                                                             |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `no_pr`   | `[GitPullRequest] Create PR` (primary badge)       | Opens PR creation dialog _(disabled while any task in the active workspace is responding)_ |
| Any other | `[StatusIcon] Status Label` (status-colored badge) | Opens dropdown menu                                                                        |

### Dropdown Actions by Status

| Status              | Primary Action | Secondary Actions                      |
| ------------------- | -------------- | -------------------------------------- |
| `draft`             | Mark Ready     | Open on GitHub, Refresh                |
| `review_required`   | —              | Open on GitHub, Refresh                |
| `changes_requested` | —              | Update Branch, Open on GitHub, Refresh |
| `checks_pending`    | —              | Open on GitHub, Refresh                |
| `checks_failed`     | —              | Open on GitHub, Refresh                |
| `merge_conflict`    | —              | Open on GitHub, Refresh                |
| `behind_base`       | Update Branch  | Open on GitHub, Refresh                |
| `ready_to_merge`    | Merge PR       | Open on GitHub, Refresh                |
| `merged`            | —              | View on GitHub                         |
| `closed_unmerged`   | —              | View on GitHub                         |

### Continue Flow For Completed Workspaces

When the active workspace PR is in a terminal state (`merged` or `closed_unmerged`), the top bar shows a secondary **Continue** button beside the PR status badge.

The flow:

1. Prompt for the new workspace branch name, defaulting to `<source-branch>--continue--<utcstamp>`
2. Refresh `origin` and create a fresh worktree from `origin/<defaultBranch>` (falling back to the local default branch with a warning if the remote cannot be refreshed)
3. Generate a markdown continuation brief from:
   - source branch and PR metadata
   - current workspace notes and open todos
   - recent commit subjects
   - branch diff summary and changed file list
4. Write the brief to `.stave/context/continued-from-<branch>.md`
5. Create a new task in the fresh workspace and attach that markdown file to the prompt draft

This is intentionally a **summary brief** flow, not a full task-history clone. It keeps the new workspace clean while carrying the previous implementation context forward in an explicit, reviewable artifact.

The dialog keeps the base branch simple by default. It shows the current remote base as a badge and reveals a searchable remote branch picker only after the user clicks **Change**.

### PR Creation Dialog

- The dialog opens in a loading splash state until the suggested PR title and description are ready. Stave no longer shows a provisional fallback draft first and then replaces it in place.
- Draft generation now includes the active workspace task, prompt-draft context, attached continuation brief snippets, notes, and open todos so the first AI draft stays focused on the current workspace instead of echoing older workspace PR summaries.
- The dialog includes a **Target Branch** picker so users can choose which base branch the PR should merge into before running `gh pr create`.
- Suggested PR titles are normalized against the branch's latest conventional commit subject so the type and scope stay aligned with the workspace PR flow guidance.
- The title field validates Conventional Commits format and expects a lowercase subject, for example `fix(topbar): add create pr loading splash`.
- If the user switches to another workspace while the dialog is open, Stave closes the dialog and discards the in-flight draft request so a previous workspace response cannot bleed into the newly active workspace.
- Right before submission, Stave refreshes git status again and auto-commits only the files that are still currently uncommitted before pushing and opening the PR.
- When uncommitted files are auto-committed during PR creation, progress, success, and failure messages are shown inline inside the dialog instead of as transient toast notifications.
- While commit, push, or PR creation is running, the dialog no longer accepts dismiss attempts that would clear the prepared title and description mid-flight.

## Store Shape

```ts
// Transient, not persisted across sessions
workspacePrInfoById: Record<string, WorkspacePrInfo>;

interface WorkspacePrInfo {
  pr: GitHubPrPayload | null; // null = no PR
  derived: WorkspacePrStatus;
  lastFetched: number; // epoch-ms
}
```

## Error Handling

| Scenario               | Behavior                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| `gh` CLI not installed | `getPrStatus` returns `ok: false`; sidebar shows fallback identity mark |
| `gh auth status` fails | Same as above; no toast spam                                            |
| Network offline        | `gh` times out; cached state preserved until next successful fetch      |
| PR deleted (404)       | `gh pr view` returns "no pull requests found"; status becomes `no_pr`   |
| Branch has no remote   | `gh pr view` fails; graceful fallback to `no_pr`                        |

## Future Work (Phase 2+)

- **PR creation → auto-refresh**: After `scm:create-pr` succeeds, immediately fetch status _(done in Phase 1)_
- **Merge queue**: Add `queued_for_merge` status for repos using GitHub merge queues
- **Edit PR**: `gh pr edit` for title/body changes from within Stave
- **Close/Reopen PR**: `gh pr close` / `gh pr reopen`
- **Webhook-based updates**: Replace polling with GitHub webhook push for real-time status
- **Archive workspace on merge**: Prompt user to archive workspace after PR is merged
- **Cross-project PR view**: Aggregate PR status across all recent projects in sidebar
