# Projects, Missions And Playbooks — Design

**Date:** 2026-09-26
**Status:** Phase 1 (missions and playbooks) implemented; see
[Missions](../../features/missions.md) and [Playbooks](../../features/playbooks.md).
Deviations from this design are listed in §15. The PR-by-PR execution plan is
kept with the task until its files exist; an as-built copy lands in
`docs/superpowers/plans/` with the final PR.
**Scope:** Product concept, vocabulary, UX and architecture placement. Phase 1
(missions) is specified to acceptance level; Projects (Phase 3) are specified
to design level; other phases are directional.

## 1. Summary

Stave already contains most of the machinery needed to hand a whole outcome to
an agent: durable delegated tasks in their own worktrees, supervised wake-ups,
schedules, tracker intake, workspace kickoff, native pull request creation, a
run ledger, project memory and a cross-workspace action inbox. It lacks the
unit that ties them together and a surface that tells the story of the work.

This design adds three user-facing objects and one supervisor:

- **Project** — a goal that spans days or weeks and many pull requests, such as
  "move the dashboard onto the new design system". A project has a
  **coordinator** — a lead conversation that plans, starts missions, reviews
  their results and decides what comes next without writing code itself — plus
  shared memory, a library of what its missions produced, start conditions and
  its own check-in cadence. Missions are a project's parallel lines of work,
  each in its own worktree and on Claude or Codex.
- **Playbook** — a saved way of working, authored in the **Playbook Builder**:
  ordered stages, what "done" means for each, which steps Stave performs itself,
  when the user wants to check in, and runtime defaults. Claude or Codex is
  still the actor; a playbook is the procedure it follows.
- **Mission** — one outcome handed off with a playbook. A mission advances one
  lead task through the playbook's stages, stops only at the user's chosen
  check-ins or where work is genuinely blocked, and ends with a **Mission
  report** that separates evidence Stave verified from what the agent reported.
- A **mission supervisor** — a Layer 3 supervisor entry, beside heartbeats —
  that advances stages from recorded stage reports and Stave action results,
  never from an ended turn alone.

The target experience: type one assignment, sign off on the plan and on
publishing (or on nothing, if you choose), and at any moment see what the agent
is doing, why, and what proves it. For larger goals, brief a project once and
supervise its missions from one place.

Missions (Phase 1) come first because they are the unit a project coordinates:
a project without reliable missions would only fan out unreliable work.

## 2. Problem

Evidence from the current product (2026-09-26, `a80ffa69` plus the uncommitted
Agent Builder prototype on this branch):

1. **Continuation depends on the model.** Every stage after the first needs a
   user turn — "verify it", "open the PR", "deploy the preview". The prototype
   compiles saved steps into one long prompt; its own documentation notes that a
   premature terminal response still requires a user turn.
2. **Deterministic capabilities are not connected.** Stave can create a PR
   (`gh pr create` in `electron/host-service/scm-runtime.ts`), reads PR checks
   and reviews, runs workspace scripts and wakes tasks unattended (task
   supervisor). None of these can be a step in a user's workflow; users prompt
   the model to do them.
3. **Delegation concepts are fragmented.** Worker (composer toggle), Advisor
   (composer toggle and budget), delegated child task (right-rail form with
   required provider, permission, lifecycle and workspace fields), heartbeat
   (Local MCP only — no renderer UI), routine (shown as "Automations"),
   kickoff, tracker Tasks and Crane dispatch each have their own entry point.
   Users choose mechanisms instead of outcomes.
4. **Progress is split across five surfaces.** Turn Activity (live), Task
   Results (history), Task Collaboration (delegations), Information (latest
   turn summary) and Fleet (attention). None answers "where is this piece of
   work, and why did it go this way?"
5. **Reusable instructions have four shapes.** Macros, runtime presets,
   `WORKFLOW_STARTERS` (defined, rendered nowhere) and the prototype's agent
   recipes overlap without a clear boundary.
6. **"Why" is requested, not recorded.** Decisions exist only as transcript
   prose, so they cannot be reviewed, shared or promoted to memory.

## 3. Goals

- One assignment runs a playbook end to end; Stave, not the model, moves to the
  next stage.
- Check-ins only where the user wants them, presented as one-click sign-offs
  carrying the evidence needed to decide.
- Stave performs what it can do deterministically (open a draft PR, watch
  checks, mark the PR ready) and records the result as verified evidence.
- A live, legible story: current stage, what is happening now, why earlier
  choices were made, and what proves each claim.
- A finished mission yields a shareable report.
- Fewer concepts at the surface: users pick a playbook and a check-in level;
  the playbook decides whether workers, delegated tasks or advisor review are
  used.

Success is measured, not asserted: user messages per mission, nudge and stuck
rates per provider, and time spent waiting on sign-off (§12).

## 4. Non-goals

- A general workflow engine, branching graphs or user-authored loops. Stages
  are ordered; the only automatic loop is the bounded checks repair loop.
- Cloud execution. Missions run on the user's machine with the user's tools,
  MCP servers and credentials.
- Implied authority. A saved playbook never grants permissions; every mission
  start records its own consent.
- Replacing tasks. The task remains the conversation unit; a mission is
  supervision around one lead task.
- Real-time Slack listening. Slack reaches Stave through a scheduled triage
  playbook that proposes missions (Phase 2).

## 5. Vocabulary

New words, added to `docs/architecture/agent-platform-taxonomy.md` before
code:

| Word | Means |
| --- | --- |
| Project | A goal spanning many missions. Has a coordinator, shared memory, a library, start conditions and a check-in cadence. Code: `Project`. Ships at least one minor release after the Repository rename. |
| Coordinator | A project's lead conversation. Plans, starts missions, reviews their reports, never edits code. Code: `coordinatorTaskId`. |
| Playbook | A saved way of working: purpose, ordered stages, check-in level, runtime defaults, optional start conditions. Code: `Playbook`. |
| Mission | One outcome handed off with a playbook, standalone or inside a project. Advances exactly one lead task. Durable Layer 3 supervisor entry. |
| Lead task | The task a mission advances. Created by intake (kickoff, tracker, proposal) or chosen by the user. |
| Stage | One ordered step: an **AI stage** (a turn with instructions) or a **Stave action** (performed by Stave). |
| Done when | The completion evidence an AI stage must report. |
| Sign-off | A stage that waits for the user before starting. Appears in Action required, distinct from tool approvals. |
| Check-ins | Preset for sign-offs: **Every stage**, **Plan and publishing** (default), **Only when stuck**. Hand edits show **Custom**. |
| Stage report | The structured record an agent files for an AI stage: summary, decisions with reasons, evidence, artifacts, or a blocker. |
| Verified by Stave / Agent reported | Evidence Stave observed (PR created, checks state, diff stats, a cited tool call Stave saw succeed) versus evidence the agent claims. Never rendered alike. |
| Mission report | The end-of-mission record assembled from stage reports and verified evidence. |
| Starts when | Conditions that propose a mission: issue assignment, PR state, schedule, triage. Code: `triggers`. |
| Proposed | Missions proposed by a start condition, awaiting Start. A tab of the Issues surface. |

Renamed existing concepts. UI copy, code identifiers, persisted names, IPC
channels and Local MCP tools are all renamed. The implementation plan lists
every mapping and data migration.

| Current | New | Code | Reason |
| --- | --- | --- | --- |
| Tasks surface (tracker tickets) | **Issues** | `TrackerIssue` | "Task" meant three things: a conversation, tracker tickets and delegated work. The connected trackers (Jira, Crane) already identify these by issue key. |
| Child task | **Delegated task** | `DelegatedTask`; the relation stays `parentTaskId` | Matches the existing "Delegate a task" and "Delegations" copy. "Track" collides with trackers. |
| Heartbeat (no UI today) | **Wake-up** | `WakeUp` | Describes what the user sees; the taxonomy already calls heartbeats wake-ups. "Follow-up" is taken by a delegated-task control. |
| Routine / Automations | **Automation** | `Automation` | The UI already says Automations. Automations become playbooks with a schedule (Phase 4). |
| Project (registered repository) | **Repository** | `Repository`, `repositoryPath` | Stave docs already say "repository" for it. It stops colliding with Jira's project field and frees **Project** for the goal-level container (§6.4), its common meaning in agent tools. |
| Task Collaboration panel | **Mission** panel | panel id `mission` | Shows the mission when one exists and the team (workers, delegated tasks, advisor) always. |
| Agent tree | **Work map** | `WorkMap` | The list view stays available. |

Kept as they are: Task, Turn, Workspace, Worker, Advisor, Fleet, Work queue,
Macro, Preset, Skill, Kickoff, Memory, Information, Action required, Ledger,
Receipt, Occurrence. Names owned by other systems are untouched: Jira and Martin
projects, the Crane `crane-tasks-v1` wire contract, and provider progress
heartbeats. Mission copy uses **Stuck**, because "stalled" already names an
idle provider turn.

## 6. Concept Model

```text
Project ── coordinator task ── starts ──▶ Mission ×N (own worktrees, Claude | Codex)
  │ goal, memory, library,                  │
  │ starts when, check-ins                  └─ reports back ─▶ coordinator wakes

Playbook ─start─▶ Mission ─advances─▶ Lead task ─turns─▶ Claude | Codex
   │                │                    ├─ Workers (in-turn)
   │ stages         │ stage records      ├─ Advisor (read-only opinion)
   │ check-ins      │ action receipts    └─ Delegated tasks (own worktree)
   │ defaults       │
   └ starts when    └─ Mission report
```

### 6.1 Playbook definition

```ts
interface Playbook {
  version: 1;
  id: string;
  name: string;
  shortcut?: string;                 // composer insertion remains a projection
  purpose: string;
  checkIns: "every-stage" | "plan-and-publishing" | "when-stuck";
  team: "solo" | "workers" | "delegation";   // "delegation" is Phase 3
  runtime?: { providerId; model?; effort?; permissionMode? };
  advisorReview?: boolean;           // advisor critique on sign-off cards
  constraints?: string;
  stages: PlaybookStage[];           // 1..12
  triggers?: PlaybookTrigger[];      // Phase 2
}

type PlaybookStage =
  | { id; title; kind: "ai"; instruction; doneWhen;
      role?: "plan" | "publish"; signOff?: "auto" | "ask" }
  | { id; title; kind: "action"; action: StaveAction; signOff?: "auto" | "ask" };

type StaveAction =
  | { type: "open-draft-pr" }
  | { type: "watch-checks"; repairAttempts: 0 | 1 | 2 | 3; timeoutMinutes: number }
  | { type: "mark-pr-ready" }
  | { type: "run-script"; scriptId: string };   // Phase 2
```

`signOff` omitted derives from `checkIns`:

| Check-ins | Asks before |
| --- | --- |
| Every stage | every stage |
| Plan and publishing | the stage after a `plan` stage, `publish` stages and `mark-pr-ready` |
| Only when stuck | nothing; blockers and stuck stages still stop |

Starting a mission signs off its first stage, so the first stage never waits,
even under Every stage.

A draft PR is created automatically under the default because it is reversible
and invisible to reviewers; making it ready for review is the publishing step.

A playbook opens a draft PR at most once, and `watch-checks` and
`mark-pr-ready` come after that stage. A playbook without an `open-draft-pr`
stage acts on the workspace's existing pull request, so its missions start only
where one exists (Fix failing checks, Address review).

Playbooks live in their own settings key and limit, not in the macro list. The
prototype's recipes were never released, so no data migration is needed; its
validation code is reused.

### 6.2 Starter playbooks (Phase 1)

| Playbook | Stages (✋ sign-off under the default) |
| --- | --- |
| Slack request → PR | Understand (plan) · Create issue (publish) ✋ · Build · Verify · Open draft PR ⚙ · Watch checks ⚙ · Ready for review ⚙✋ · Report back to the thread (publish) ✋ |
| Request → PR | Understand (plan) · Build ✋ · Verify · Open draft PR ⚙ · Watch checks ⚙ · Ready for review ⚙✋ |
| Fix failing checks | Diagnose · Fix · Watch checks ⚙ |
| Address review | Read review (plan) · Change ✋ · Watch checks ⚙ · Reply to reviewers (publish) ✋ |

Under the default, Request → PR asks twice: once to confirm the acceptance
criteria before building, once when the PR is green and ready for reviewers.
Slack request → PR asks three times: the plan together with the issue it will
create, ready for review, and the message it will post to the thread.
Stage templates available from Add stage: Create issue (publish), Deploy
preview (publish; an AI stage until `run-script` arrives), Report back to the
thread (publish), Visual check. `WORKFLOW_STARTERS` and the
prototype's four recipes become Phase 2 starters.

### 6.3 Mission

A mission record holds the playbook snapshot frozen at start, the lead task
identity (`repositoryPath + workspaceId + taskId`), an optional `projectId`, the assignment, consent
(check-in level, authorized external effects, permission mode), per-stage state
and reports, attempt counters, and a terminal reason.

Stage lifecycle:

```text
pending ─▶ awaiting-sign-off ─▶ running ─▶ completed
               │                  ├─▶ blocked ─▶ running | skipped | cancelled
               └─▶ skipped        └─▶ stuck   ─▶ running | cancelled
```

### 6.4 Project

A project record holds: goal, repository, coordinator task identity, check-in
cadence, start conditions, a memory scope, the missions it started, and a
terminal reason.

- **Coordinator.** A normal task in the repository's default or a dedicated
  workspace, running under a coordination playbook. It edits no files: its
  turns carry a coordination-only instruction and a read-oriented permission
  mode. It uses Local MCP tools to start missions, list them and read their
  reports, all scoped by a per-turn project grant.
- **Missions as parallel work.**
  - The coordinator starts each mission through intake: a new worktree, a
    playbook, a provider and an assignment.
  - Each mission runs exactly as a standalone mission does, with its own
    sign-offs.
  - A mission's report returns to the coordinator; never its transcript.
- **Follow-through.** When a mission of the project finishes, gets stuck or
  needs a sign-off, a project wake-up (the existing completion trigger,
  generalized from delegated tasks to missions) wakes the coordinator with the
  mission's identity, state and report summary. Batches coalesce into one turn,
  as delegated-task completions do today.
- **Shared memory.** A project-scoped memory layer sits on top of repository
  memory.
  - Accepted stage decisions and coordinator notes are recalled by every
    mission in the project.
  - Entries start as candidates, and the project's settings choose whether
    decisions are accepted automatically.
- **Library.** Every mission's report, pull requests, issues, preview links and
  documents, grouped by mission, searchable, and linked from the Information
  panel.
- **Check-in cadence.** How often the coordinator summarizes progress, whether
  it may start missions without asking, and the maximum parallel missions.
- **Usage.** Per-project and per-mission spend, where runtimes report it.
- **Staged autonomy.** A project starts with "ask before starting a mission" and
  every mission at the default check-ins. The user loosens either as trust
  grows; Phase 5 suggests loosening from the sign-off history.

Stave runs projects on the user's machine. Work continues while Stave is open,
including in the background; closing Stave pauses the project, and it resumes
from recorded state on the next launch.

## 7. Supervision

### 7.1 Layer placement

A mission supervises a task the user already owns, so it lives in Layer 3 as a
task supervisor entry kind, beside heartbeats. It owns its own tables
(`missions`, `mission_stages`, `mission_events`). It **reads** the run ledger
(delegated task completions) and PR checks and writes only its own rows. The
run ledger is not widened for missions.

Stave actions are guarded like heartbeat occurrences: an `action-started` event
row is written before execution with an idempotency key of
`missionId:stageId:attempt`, so a restart never repeats an action whose outcome
is unknown. It checks remote state first; `gh pr create` already refuses
duplicates and returns the existing URL.

The prototype's taxonomy paragraph ("must not create a second executor") is
replaced: the mission supervisor starts turns the same way the task supervisor
does and is bound by the same safety rules.

A project is intake plus supervision. It creates missions through the same
kickoff path users take, which mints their tasks. It advances only its own
coordinator task, through project wake-ups. It never starts turns on a
mission's lead task.

### 7.2 Decision order

The policy is pure and lives in a new mission policy module beside
`src/lib/supervision/wake-up-policy.ts`; I/O lives in the host service beside
the task supervisor.

1. Mission cancelled, lead task archived or deleted, turn cap or expiry reached
   — **stop** with a reason and a partial report.
2. Lead task identity changed — **pause**. Runtime changed — **pause** with
   "Apply to remaining stages" and "Keep original".
3. Local MCP unreachable — **blocked: Reporting unavailable**, not a nudge. The
   model cannot report through a connection that is down.
4. Lead task waiting on a tool approval or a question — **wait**. The existing
   Action required item represents it.
5. A turn is running — **idle**.
6. The AI stage has a `complete` report — **completed**. The next stage either
   becomes **awaiting-sign-off** or its turn **starts**.
7. The AI stage has a `blocked` report — **blocked**, with the agent's missing
   input. A reply in the task resumes the stage.
8. A turn ended without a report — the first time, a bounded **nudge**; the
   second time, **stuck**.
9. A Stave action — execute it and record the result as verified evidence. On
   failure, **blocked** with Stave's own reason (for example missing `gh`
   authentication).

### 7.3 User messages during a mission

While a mission is active, the composer shows a chip: **Mission continues after
this reply**. This is on by default, so the user's message becomes guidance for
the current stage. The chip switches to **Take over**, which pauses the mission
until Resume. The user never has to prompt the mission forward.

**Ask for changes** on a sign-off card reruns the previous AI stage as attempt
2, with the feedback attached.

### 7.4 Watching checks

`watch-checks` polls the raw checks rollup in the host service through
`scm-runtime`, persisted in mission events. It does not use the renderer's
derived `WorkspacePrStatus`. That enum reports `draft`, `merge_conflict` or
`changes_requested` ahead of checks, and it polls only in the renderer.

| Observation | Result |
| --- | --- |
| All required checks pass | completed (verified) |
| A check fails | Repair turn with the failing check's name and log link, up to `repairAttempts` (default 2), then blocked |
| No checks configured | completed, labeled "No checks configured" (verified) |
| A check stays pending past `timeoutMinutes` | stuck, labeled with the check name and its age |
| Merge conflict or behind base | blocked, with an offer to rebase in an AI turn |
| Changes requested while waiting | Recorded on the stage. Proposes Address review after the mission, without blocking the checks. |

It never merges.

### 7.5 One source of automatic turns

While a mission is active, its lead task's heartbeats pause with reason
`mission-active`, and new heartbeats are refused. A mission creates wake-ups for
its delegated tasks itself (Phase 3). One active mission per lead task; a second
Start on the same task offers to cancel or queue behind the first.

### 7.6 Lanes

| Mission state | Workspace lane |
| --- | --- |
| awaiting sign-off, blocked, stuck | `action-required` |
| running, watching checks | `in-progress` |
| completed, with an open PR awaiting review | `in-review` |
| completed or cancelled with nothing open | `idle` |

## 8. UX

### 8.1 Starting a mission

All entry points open the same **Start mission** sheet:

- The **Hand off** control in the composer, next to macros, or `!shortcut`
- A **Playbook** field in the Issues kickoff sheet and in Workspace
  Kickoff. The default comes from the tracker scope mapping.
- Command palette: `Start mission…`
- Phase 2: **Start** on a Proposed item

The sheet includes:

- The stage rail, with sign-off markers
- The assignment field (it accepts a pasted Slack or tracker link)
- The check-in selector
- External effects, each with a checkbox: tracker write, PR, message, script
- The runtime row
- **Edit a copy**, which can change stages *this time only* or *save as new
  playbook*

Pre-start checks are shown before Start is enabled: Local MCP reachable, `gh`
authenticated when the playbook has PR actions, and the workspace clean or the
dirty state acknowledged. The primary button names its consequence: **Start —
asks before building and before requesting review**.

Starting from a task binds the mission to it. From a task with history, **Start
at stage** is offered, and an existing PR for the branch is adopted as verified
evidence. Starting from intake creates the workspace through kickoff first.

### 8.2 Mission bar

The Mission bar is the header of Turn Activity in every placement: docked,
floating and panel. The shelf's rows, todos and approval focus stay underneath
it.

```text
◆ Request → PR · Fix billing table overflow          Plan and publishing · 18m
① Understand ✓  ② Build ✓  ③ Verify ●  ④ Draft PR  ⑤ Checks  ⑥ Ready ✋
Now  Running the billing tests — 42 passed so far                   3 of 5 todos
```

Sign-off cards use the same slot and priority as tool approvals, one at a time:

```text
✋ Ready for review — PR #612 · 4 files +82 −17 · checks 12/12 · Advisor: no concerns
   [Mark ready and notify]   [Review changes]   [Ask for changes]
```

Content rules make progress feel alive without decoration:

- **Now line.** Plain language, never a raw tool name. It changes at most once
  every ~1.5 seconds. The source is the current turn's latest tool activity or
  progress text.
- **Progress figure.** The stage's own todo count is the only number shown
  within a stage.
- **Stage completion.** The row holds for about 3 seconds ("Build done · 4
  files +82 −17") before the next stage takes over. This is the only transition
  animation.
- **Waits.** Every wait is named and aged: "Checks 7/12 · 6m", "Waiting for
  your sign-off · 2h".
- **Historical missions.** Rendered static, never animated.

Accessibility:

- The stepper is an ordered list with `aria-current="step"`.
- A polite live region announces stage changes and sign-off requests only.
- Every status pairs an icon with text.
- Reduced motion replaces the ring and hold with static text.
- Narrow widths collapse the stepper to "Verify · 3 of 6".

### 8.3 Mission panel (right rail)

The Mission panel replaces Task Collaboration. It opens automatically when a
mission starts. For a task without a mission, it shows **Hand off** above the
existing team section.

```text
Mission · Request → PR                                          ⋯
Goal       Fix billing table overflow on narrow screens
Done when  Signed off by you at 13:41
  ✓ Table scrolls horizontally below 768px     Agent reported · screenshot
  ○ No layout shift on desktop                 pending
───────────────────────────────────────────────────────────────
✓ Understand     3m
  Slack thread ↗ · 3 acceptance criteria
  Why ▸ Scope limited to the billing table; other tables unaffected
✓ Build          9m   signed off 13:41
  4 files · +82 −17   View changes      Decisions (2) ▸
● Verify         now
  Verified by Stave   bun run typecheck — exit 0
  Agent reported      visual check at 375px
○ Open draft PR
○ Watch checks   up to 2 repairs
✋ Ready for review
───────────────────────────────────────────────────────────────
Team   2 workers in this stage · Work map ▸
```

Each stage expands to:

- its instruction snapshot
- decisions with reasons
- evidence, with Verified by Stave items first
- artifacts
- duration and the turns it used, each linked to the exact transcript position

Every stage carries facts Stave collected itself (diff stats, commands run with
exit codes, test results where parsable). A stage with a missing report still
has content. Worker fan-out renders inside the stage that produced it, using
the prototype's Work map.

### 8.4 Transcript

Stage boundaries render as quiet dividers, for example "Stage 3 · Verify —
started automatically after Build reported done" or "Ready for review — signed
off by you at 14:02". The transcript tells the same story as the panel.

### 8.5 Mission report

The report is assembled on completion, cancellation or stop, so a partial
report is always available. It appears at the top of Task Results, in the
Mission panel and on the Fleet card.

```text
Mission complete · 34m · 2 sign-offs · 11 turns
Outcome    PR #612 ready for review, checks passing
Evidence   Verified by Stave  PR #612 created · checks 12/12 · typecheck exit 0
           Agent reported     visual QA at 375/768/1280px
Decisions  Container query instead of a resize listener — keeps SSR stable
Open       Safari 16 not verified
Left behind  branch feat/billing-overflow pushed · PR #612 open
[Copy Markdown]  [Add to PR description]  [Save decisions to memory]
```

### 8.6 Playbook Builder

The builder is a **Playbooks** tab in the Automations center, beside
Automations and Run history. It opens from the Start sheet ("Manage
playbooks") and the command palette. Phase 4 merges scheduled automations into
it.

```text
Request → PR                    Check-ins  Plan and publishing ▾
Purpose   Take a request from Slack or a tracker to a PR ready for review
Runs with Claude · Opus 5.5 · high · Guided permissions
─────────────────────────────────────────────────────────────────────────
1 ✦ Understand        Read the linked request; write acceptance…   plan
2 ✦ Build             Implement the smallest complete change…       ✋
3 ✦ Verify            Run the project's checks; inspect UI at…
4 ⚙ Open draft PR     Stave action
5 ⚙ Watch checks      Stave action · repairs 2 · timeout 30m
6 ⚙ Ready for review  Stave action                                   ✋
+ Add stage
─────────────────────────────────────────────────────────────────────────
[Draft with AI]                                               [Save]
```

- Stage rows are editable in place: title, instruction, Done when and the
  sign-off toggle. A side pane opens only for Stave action settings.
- Toggling a sign-off by hand switches Check-ins to **Custom**.
- **Draft with AI** accepts a sentence or a pasted real example of how you
  worked, and utility inference drafts the stages.
- First playbook in under two minutes: duplicate a starter, or choose **Edit a
  copy → save** in the Start sheet. Phase 2 adds **Save as playbook** from a
  finished mission.
- Team settings stay hidden until Phase 3.

### 8.7 Project home

Opened from the sidebar (projects list above workspaces) and from Fleet.

```text
Dashboard design-system move            3 running · 1 needs you · 7 done
Goal  Every dashboard screen uses the new components; no legacy imports
───────────────────────────────────────────────────────────────────────
Coordinator  "Started Billing table and Settings forms in parallel;
              Navigation waits on the shared header change (#618)."
───────────────────────────────────────────────────────────────────────
Needs you   ✋ Settings forms · Ready for review · PR #621 · checks 14/14
Running     ● Billing table · Verify · Claude      ● Header · Build · Codex
Done        ✓ Tokens · PR #605 merged   ✓ Buttons · PR #611 merged   …
───────────────────────────────────────────────────────────────────────
Memory (12) · Library (31) · Starts when: PR review comments, Mon 09:00
```

- The coordinator conversation opens beside the board; briefing it is how the
  user adds work.
- Each mission row opens that mission's lead task with its Mission bar.
- Sign-offs from any mission surface at the top and in Fleet.
- Check-in cadence, parallel limit, memory policy and start conditions are
  project settings.

### 8.8 Fleet and notifications

- New attention kinds: `mission-sign-off`, `mission-blocked`, `mission-stuck`,
  ordered with approvals and questions. A sign-off from Fleet shows the same
  evidence summary as the task card.
- A workspace card shows the mission's stage rail.
- OS notifications fire on sign-off, blocker, stuck and completion. Sign-offs
  waiting longer than a configurable interval are batched into one reminder.
- Sign-off cards and cap warnings show spend where the runtime reports usage.

## 9. Architecture

| Concern | Owner |
| --- | --- |
| Playbook schema, sign-off derivation, per-stage prompt compilation | new `playbooks` module under `src/lib/` |
| Mission domain and pure supervisor policy | new `missions` module under `src/lib/`; the automatic-turn owner in the `supervision` module, next to `src/lib/supervision/wake-up-policy.ts` |
| Mission tables and host I/O | a mission runtime beside `electron/host-service/wake-up-runtime.ts`; tables beside the wake-up tables |
| Turn start | `runSupervisedTurn` in `electron/host-service/supervised-turn.ts`, the path wake-ups already use |
| Stave actions | `scm-runtime` (`gh pr create --draft`, `gh pr ready`, checks rollup query) |
| Stage reporting | Local MCP `stave_get_mission`, `stave_report_stage`, `stave_block_stage`, exposed only under a per-turn mission grant beside the advisor and worker grants in `electron/providers/stave-turn-grants.ts`; Phase 2 `stave_propose_mission` |
| Evidence cross-check | the Local MCP turn journal and normalized tool results for cited calls |
| Attention projection | `src/lib/fleet/attention-projection.ts` |
| Renderer state | a mission slice with row-local selectors and no fresh containers from selectors |
| UI | new `missions` and `playbooks` folders under `src/components/` |

- **Provider-neutral.** Claude and Codex both report through Local MCP tools.
  The mission grant is minted in the shared runtime layer and forwarded by the
  same header and environment path both adapters already use for advisor and
  worker grants. The host resolves the mission, stage and attempt from the
  grant, so the model never passes ids and cannot report for another stage.
  Without Local MCP, the Start sheet offers a single-turn assignment and
  explains why.
- **Per-stage prompts.** Each automatic turn carries the playbook purpose, the
  current stage's instruction and Done when, earlier stages' summaries and the
  reporting contract. It also carries a retrieved-context part naming the
  mission, stage and reason, like a heartbeat occurrence.
- **Verified evidence.** A report may cite tool-call ids or commands. A citation
  counts as Verified by Stave only when Stave observed that call succeed in
  this stage's turns.
- **Delegated tasks** keep their coordinator unchanged. When a stage's lead
  delegates, the mission creates the completion wake-up. A stage cannot
  complete while its delegated tasks are active.
- **Projects (Phase 3)** add:
  - a project store (tables `projects`, `project_missions`, `project_events`)
  - a project grant for coordinator turns
  - the Local MCP tools `stave_start_mission`, `stave_list_missions` and
    `stave_get_mission_report`, available to coordinators only
  - the completion wake-up generalized to missions
  - a project memory scope

Boundary statements to add to the taxonomy and `config/reliability-gates.json`:

8. A mission advances exactly one lead task and never creates a task.
9. A stage completes only through a recorded stage report or a Stave action
   result; an ended turn alone never completes a stage.
10. A saved playbook never grants permissions; every mission start records its
    own consent.
11. At most one supervisor entry starts automatic turns on a task at a time.
12. A project never advances a mission's lead task; it starts missions through
    intake and advances only its coordinator task.

## 10. Existing Concepts — Evaluation And Disposition

| Concept | Value today | Problem | Disposition |
| --- | --- | --- | --- |
| Worker | In-turn parallel help | Users decide per turn through a composer toggle | Playbook `team: workers` enables it; the toggle stays for ad-hoc tasks; shown inside the stage. |
| Advisor | Independent read-only opinion | Enable-and-budget friction; output buried in exchanges | `advisorReview` puts a critique on sign-off cards, where a second opinion changes a decision. |
| Delegated task | Durable, cross-provider, own worktree | Five required choices; framed as "another model" | Projects start missions for parallel outcomes. Delegated tasks remain the mechanism for ad-hoc help inside a task; the manual form stays. |
| Heartbeat | Safe unattended wake-ups | No UI; users cannot see or create one | Shown as **Wake-ups** in the Mission panel and task header; manual "Wake up when…" later. |
| Routine | Scheduled new-task runs | A separate prompt model | Phase 4: an automation is a playbook plus a schedule; existing automations keep working. |
| Kickoff / Tasks / Crane | Source → workspace → prompt | Ends at a bare prompt | Gain a Playbook field and start a mission. |
| Macros / presets | Text insertion / runtime launch | Overlap with starters and recipes | Macros stay snippets, presets stay runtime; both starter lists become starter playbooks. |
| Work graph / Work map | Turn fan-out | Hidden unless workers exist | Rendered inside the stage that fanned out. |
| Turn Activity / Results / Collaboration | Live / history / team | Five places for one story | Phase 1: the Mission bar heads Turn Activity; the report tops Results. Phase 4: one Work panel (Now · Team · History). |
| Turn summary / project memory | Recall across tasks | Decisions are prose | Stage decisions become memory candidates on request. |

## 11. The Uncommitted Prototype On This Branch

| Part | Keep | Change |
| --- | --- | --- |
| Recipe schema and normalization | Validation discipline, size bounds | Rewritten as the playbook schema; never released, so no data migration; storage leaves macros. |
| Assignment form | Frozen target, duplicate-send guard, per-assignment consent | Becomes the Start mission sheet. |
| Starter recipes | Content | Phase 2 starters, merged with `WORKFLOW_STARTERS`. |
| Plan & progress | Honest "reported complete" wording | Fallback for tasks without a mission; the in-stage todo count. |
| Work map | Layout, live versus historical | Scoped to a stage's workers. |
| Settings section, `<details>` entry | — | Replaced by the Playbooks tab and Hand off. |
| Unrelated reformat of the memory settings case | — | Revert. |

## 12. Delivery

### Phase 1 — Missions for one lead task

In scope:

- Playbook schema and starters
- The Playbooks tab
- Start mission from the composer and the Issues kickoff sheet
- Supervisor tables and policy
- AI stages, sign-offs, nudge and stuck
- The `open-draft-pr`, `watch-checks` (with repair) and `mark-pr-ready` actions
- Stage report MCP tools
- Mission bar, Mission panel, transcript dividers, Mission report
- Fleet attention kinds
- The four starter playbooks
- Pre-start checks
- Metrics: user messages per mission, nudge and stuck rate per provider, and
  time waiting on sign-off

Out of scope for Phase 1: `run-script`, Save as playbook, Share to Slack,
remaining starters, delegation team mode. The UI stays behind a developer
setting until A1–A6 pass.

Acceptance:

- **A1.** From a task, run Request → PR on a tracker or Slack link under the
  default check-ins.
  - Only two user actions are needed after Start: sign off the plan, then sign
    off Ready for review.
  - Stave opens the draft PR and watches checks. A failure triggers up to two
    repair turns.
  - The Mission report lists the PR and checks as Verified by Stave and
    decisions as Agent reported.
- **A2.** A turn that ends without a stage report is nudged once
  automatically. A second miss produces a `mission-stuck` item and a
  notification.
- **A3.** Quitting and reopening Stave mid-mission resumes from the recorded
  stage. No PR, turn or sign-off item is duplicated.
- **A4.** A user message during a stage is guidance and the mission continues
  afterward. **Take over** pauses it until Resume.
- **A5.** Claude and Codex lead tasks behave identically for A1–A4.
- **A6.** With Local MCP unavailable, the mission shows "Reporting
  unavailable" instead of nudging, and Start is refused with the reason.

### Phase 2 — Start conditions and Proposed

- Tracker assignment and PR state (`checks failed`, `changes requested`) as
  start conditions.
- `stave_propose_mission` for a scheduled triage playbook that reads Slack or
  other sources through the user's MCP servers.
- A **Proposed** tab on Issues; Fleet shows only its count.
- Start conditions attach to a playbook in Phase 2 and to a project in Phase 3.
- Auto-start only when the first stage is not a publish stage.
- `run-script` (for example a preview deployment), Save as playbook, Share to
  Slack, and the remaining starters.

### Phase 3 — Projects

- Project store, coordinator task and coordination playbook.
- Coordinator Local MCP tools and the project grant.
- Project wake-ups on mission completion, stuck and sign-off.
- Project memory scope and library.
- Project home and sidebar projects list.
- Start conditions on projects.
- Parallel limits and check-in cadence.
- Per-project usage.
- Released at least one minor version after the Repository rename, with a
  CHANGELOG note that "Project" now means a goal and repositories were renamed
  earlier.

Acceptance:

- **P1.** Brief a project with a two-part goal. The coordinator starts two
  missions in separate worktrees, one on Claude and one on Codex, after the
  user's sign-off.
- **P2.** When both missions finish, the coordinator wakes once, reads both
  reports and proposes the next mission without a user message.
- **P3.** A decision accepted in one mission is recalled by the next mission in
  the same project, and not by missions outside it.
- **P4.** Quitting Stave pauses the project, and relaunching resumes it with no
  duplicate missions.

### Phase 4 — Consolidation

- One Work panel (Now · Team · History) replacing three right-rail panels.
- Automations as playbooks with schedules.
- Wake-up copy.
- Repository-shareable playbook files that carry no permissions.

### Phase 5 — Learning loop and team reporting

- "Improve this playbook" suggestions from the user's corrections during
  missions.
- A weekly mission digest to a document or channel, after sign-off.

## 13. Testing

- Pure supervisor decision table, mirroring the task supervisor tests,
  including heartbeat suspension and runtime-change handling.
- Playbook schema and sign-off derivation from check-ins.
- `watch-checks` observation table against recorded rollup fixtures.
- MCP tool contracts, including duplicate reports and cited-call verification.
- Restart reconciliation with an `action-started` event and unknown outcome.
- Render tests for Mission bar states (live, sign-off, blocked, stuck,
  reporting unavailable, historical) and the report's evidence separation.
- A browser scenario for A1 with mocked provider and checks transport.
- Boundary statements 8–12 registered as reliability gates.
- Theme verification per the repository UI guardrails.

## 14. Risks And Open Questions

- **Report discipline.** Models may skip `stave_report_stage`. Mitigations:
  per-stage prompts, one nudge, Stave-collected facts on every stage, and stuck
  surfaced honestly. Measure per provider before recommending Only when stuck.
- **Unattended cost.** Repairs and nudges spend tokens. They are bounded by
  caps and shown on sign-off cards and in the report.
- **Reusing "Project".** Existing users knew "Project" as a repository. The
  Repository rename lands first and Projects ship at least one minor release
  later, with a CHANGELOG note, so the two meanings never coexist in one
  release.
- **Background execution.** Projects run while Stave runs; they do not continue
  with the app closed. This is a deliberate local-first trade.
- **Naming.** "Playbook" is proposed over "Agent". "Agent" already names the
  provider actor, subagents, `AgentNode` and repository agent-instruction
  files. If the user prefers "Agent", the builder becomes Agent Builder and the
  code type becomes `AgentDefinition`.
- **Slack latency.** Triage is scheduled, not real time.
- **Phase 1 size.** The supervisor is the critical path. UI work can proceed
  against fixtures in parallel.

## 15. As Built (Phase 1)

Phase 1 shipped as designed, with these deviations:

- **Mission bar.** A shelf that tucks under the turn shelf or the composer
  rather than a header inside it; it leads with the current stage and what it
  is doing, and the mission's name and assignment are in the panel. The
  separate reply chip became **Take over** / **Resume** on the bar.
- **Sign-off card.** Sits in the composer's approval slot, shown when no tool
  approval is pending, and asks a question (**Ready to start Verify?**).
- **Start sheet.** The assignment comes first; external effects are one
  checkbox list under the stage rail; **Start at** picks the first stage, and
  earlier stages are recorded as skipped. The Kickoff and Issues paths create the
  task, then open the sheet on it, so consent is always collected in the
  sheet.
- **Builder.** Stave action settings are edited inline in the stage row, not in
  a side pane.
- **Spend.** Summed from the provider-reported usage of the mission's turns:
  the cost where the provider reports one (Claude), tokens otherwise (Codex),
  on the sign-off card, the Mission panel, the report and the Fleet strip,
  beside the turn budget and its near-limit warning.
- **Metrics.** User replies, nudges, stuck stages and sign-off waits are
  computed from mission events for the report footer; there is no separate
  diagnostics view.


## 16. As Built (Phase 3)

Phase 3 shipped as designed, with these deviations:

- **Coordinator.** An ordinary Claude or Codex task that the project runtime
  wakes, not a mission running a coordination playbook; there is no
  coordination starter. Its turns are read-only and carry a project grant, so
  the project tools exist only there.
- **Proposals.** `stave_start_mission` records a proposal keyed by the
  coordinator's start key; approving it (or **Ask before starting** off)
  starts an ordinary mission that records its project. There is no separate
  project-missions table.
- **Wakes.** The coordinator wakes when a mission ends, waits for a sign-off,
  or is blocked or stuck. Changes that land during its turn arrive together in
  the next one, and 24 automatic turns in a day pause the project.
- **Project home.** One reading column — header, coordinator summary, then
  Needs you, Running and Done lanes on one row grid, then Memory, Library and
  Settings tabs. The coordinator conversation opens in its own task (**Open
  coordinator**) rather than docked beside the board.
- **Models and spend.** The coordinator may name a model per mission, and the
  user may change provider and model on a proposal before starting it. The
  project home adds up what its missions spent.
- **Not built yet.** Start conditions on projects (Phase 2 triggers).
- **Restarts.** Quitting stops the runtimes rather than recording a paused
  state. On relaunch missions resume, delivered changes are not re-sent, and
  a start interrupted halfway is marked failed instead of replayed.
