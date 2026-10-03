# Projects, Missions, Playbooks And Vocabulary — As-Built Plan

**Design record:** [`docs/superpowers/specs/2026-09-26-projects-missions-playbooks-design.md`](../specs/2026-09-26-projects-missions-playbooks-design.md)
(§15 and §16 record the design-level deviations).

**Status:** built as twenty ordered changes: the design record, five
vocabulary renames, missions and playbooks (Phase 1) and projects (Phase 3).
Later, playbooks folded into agents: the Playbooks tab, the Start sheet,
the hand-off control and their modules named below were removed (see
`docs/features/agents.md`, Workflow). This copy keeps each change's As-built note — what shipped, where, and how it
differs from the plan. The working plan, which names pre-rename paths and
files that were planned but never created, stays out of the tracked docs.

## Sequence

| # | Change | Commit subject |
| --- | --- | --- |
| 0 | Design record | `docs: record the projects, missions and playbooks design` |
| 1 | Rename | `refactor: rename routines to automations` |
| 2 | Rename | `refactor: rename task heartbeats to wake-ups` |
| 3 | Rename | `refactor: rename child tasks to delegated tasks` |
| 4 | Rename | `refactor: rename tracker tasks to issues` |
| 5 | Rename | `refactor: rename projects to repositories` (UI and docs, then code and storage, then files and channels) |
| 6 | Playbooks | `feat(playbooks): add playbook schema and starter playbooks` |
| 7 | Missions | `feat(missions): add mission domain, supervisor policy and storage` |
| 8 | Missions | `feat(missions): run ai stages from the host supervisor` |
| 9 | Missions | `feat(missions): perform pull request stages as stave actions` |
| 10 | Missions | `feat(missions): show missions in turn activity, panel and transcript`; `feat(missions): add mission report actions and show wake-ups`; `feat(missions): give mission surfaces one layout and hierarchy` |
| 11 | Playbooks | `feat(playbooks): add the playbook builder and start mission sheet` |
| 12 | Fleet | `feat(fleet): route mission attention, lanes and notifications` |
| 13 | Missions | `test(missions): cover request to pr end to end and document missions` |
| 14 | Projects | `feat(projects): add project domain, storage and coordinator policy` |
| 15 | Projects | `feat(projects): let coordinators start and review missions` |
| 16 | Projects | `feat(projects): wake coordinators when their missions change` |
| 17 | Projects | `feat(projects): scope memory and collect a project library` |
| 18 | Projects | `feat(projects): add the project home, sidebar list and fleet rollup` |
| 19 | Projects | `test(projects): cover a two-mission project end to end and document projects` |

Release note: the changes from 14 on reuse the word "Project" for a goal.
Publish them in a minor release after the one carrying the Repository
rename, with a CHANGELOG note that says so.

## As-Built Notes

### PR 1 — `refactor: rename routines to automations`

As-built:

- [x] The temporary migration infrastructure:
  - `config/temporary-migrations.json`
  - `scripts/check-temporary-migrations.mjs`, wired into `package.json`,
    `test:ci` and `.github/workflows/pr-checks.yml`
  - `tests/check-temporary-migrations.test.ts`
  - the AGENTS.md section and the release skill and checklist steps
- [x] Codemod rule set `automations`, with collision report and protected
      phrases for ordinary-English uses ("routine work", "routine approval",
      "discovery routine", "force-terminate routine"). The command palette
      keeps "routine" as a search keyword.
- [x] One collision fixed by hand: the runtime's local
      `routineRuntimeToProviderOptions` wrapper would have shadowed the renamed
      import. It is now `automationSpecToProviderOptions`.
- [x] `app_state` persistence extracted from `sqlite-store.ts` into
      `electron/persistence/automation-state-store.ts`, which owns the marked
      migration `automation-app-state-keys` (removeInVersion 0.22.0). The
      ratchet dropped from 3097 to 3044.
  - Test: automation-state-migration.test.ts (removed) covers the move, the new
    key winning, idempotency and unreadable legacy JSON.
- [x] No notification kinds or result-navigation keys embed `routine`, so no
      further data migration was needed.
- [x] Taxonomy: boundary 1 reads "An automation never wakes an existing
      task", the gate text is updated, and there is an Automation vocabulary
      row.
- Gates run: `bun run typecheck`, `node scripts/typecheck-main.mjs`, 387
  focused tests, the static checks, and `bun run test:ci` (see the handoff for
  the result).

### PR 2 — `refactor: rename task heartbeats to wake-ups`

As-built:

- [x] Codemod rule set `wake-ups`:
  - global compound rules plus **scoped** rules for the feature's files
  - TypeScript sources are parsed, so identifiers become `wakeUp` and
    comments and strings become "wake-up"
  - marked migration blocks and registered migration tests are never
    rewritten
  - the collision report now works per file on AST identifiers and reports
    many-to-one merges
- [x] The improved report found a merge the first report missed. A test
      helper `createHeartbeat` and the imported `createTaskHeartbeat` both
      became `createWakeUp`; the helper is now `createWakeUpFixture`.
      Replaying the improved report on the pre-PR 1 tree also flags PR 1's
      real collision, plus two false positives: props of different
      components, and locals in separate test scopes.
- [x] `runSupervisedTurn` extracted to `supervised-turn.ts`, so missions reuse
      it. `local-mcp-runtime.ts` drops from 2886 to 2848 lines (ratchet 2849).
- [x] Temporary migration `wake-up-tables` in `wake-up-store.ts`
      (removeInVersion 0.22.0):
  - renames the tables and the column, drops the old index names
  - legacy data wins over an empty new table
  - both populated: warns and keeps the legacy table
  - Test: wake-up-store-migration.test.ts (removed), including the
    idempotency guarantee for occurrences recorded before the rename.
- [x] Taxonomy (Wake-up vocabulary row, boundary 2, Layer 3 text), contracts,
      architecture index and the feature doc updated. Awkward "a wake-up
      wakes" phrasing rewritten. The design record now points at the new
      paths.
- Gates: `bun run typecheck`, `node scripts/typecheck-main.mjs`, 431 focused
  tests, and `bun run test:ci` (see the commit).

### PR 3 — `refactor: rename child tasks to delegated tasks`

As-built:

- [x] Codemod rule set `delegated-tasks`:
  - IPC channel rules come before the generic rules
  - protected run-id shapes
  - the "child task" alias is protected
- [x] Temporary migration `delegated-task-ledger-kinds` in
      `run-ledger-store.ts` (removeInVersion 0.22.0) rewrites legacy kinds and
      the exact bookkeeping strings in one transaction and keeps run ids.
  - Test: delegated-task-ledger-migration.test.ts (removed).
- [x] UI-only exchange ids moved to `delegated-task:<key>`. They are not
      persisted.
- [x] Prose fixed after the run:
  - "delegated child task" had become "delegated delegated task" in 13 files
  - "Prefer a **Automation**" survived PR 1's article rule
  - "delegate work to a delegated task" reworded
- [x] Tests updated where they encoded the old shape: the sorted summary keys,
      and the IPC contract regex now matches `delegations:*`.
- [x] Taxonomy: Delegated task vocabulary row, including the run-id note.
- Gates: `bun run typecheck`, `node scripts/typecheck-main.mjs`, 478 focused
  tests, `bun run test:ci` (see the commit). The ledger schema version stays
  2, because the row shape did not change.

### PR 4 — `refactor: rename tracker tasks to issues`

As-built:

- [x] Codemod rule set `issues`:
  - new `pathRenames` / `keepPaths` support moves whole directories and test
    families
  - bare "Tasks" identifiers and UI strings are scoped to the surface's files
  - lowercase surface ids were changed by hand, because a keyword `"tasks"`
    string is indistinguishable
- [x] Temporary migrations (removeInVersion 0.22.0):
  - `tracker-issue-tables` in `tracker-issues-store.ts`
  - `issue-tracker-settings` in legacy-settings.ts (removed),
    called from `app-store-persistence.ts` on the persisted snapshot before
    the defaults merge. It covers the settings key, the shortcut override,
    command palette recents and the two local view keys.
  - Test: tracker-issue-migrations.test.ts (removed).
- [x] Persisted `activeAppSurface` with the old kind already falls back to the
      workspace, so it needs no migration.
- [x] Taxonomy: Issue vocabulary row.
- [x] Test expectations updated for the new ids and copy (settings registry,
      source status, empty state).
- Gates: `bun run typecheck`, `node scripts/typecheck-main.mjs`, 663 focused
  tests, the static checks, `bun run test:ci` (see the commit).

### PR 5 — `refactor: rename projects to repositories`

As-built:

- [x] A TypeScript language-service codemod
      (rename-repositories.ts (removed)): seeds every declaration
      whose name contains "project" and is not a Martin/Jira/provider concept,
      then renames each symbol with `findRenameLocations`. Merges the two edits
      that land on one shorthand/aliased span, and follows renamed compound
      names into string literals (Pick keys, tool names, test titles). Foreign
      concepts excluded by file, by name pattern, by declaration type, and by
      following a property's definition site. 2,800 symbols, ~380 files.
- [x] Kept unchanged on purpose (values/columns/keys, not symbols):
  - SQLite column `project_path`, tables `project_memories` /
    `project_memory_settings`, and the `app_state` keys `project_registry` /
    `active_project_path`. Row-interface snake fields stay `project_path` /
    `project_name` so the mapper matches the columns; the domain objects use
    `repositoryPath`. No DB migration needed.
  - The workspace-scripts target tier value `"project"` (paired with
    `"workspace"`), `cwd: "project"`, and the scripts config record keys.
  - `staveProjectPath` inside the kept Jira/Crane `projectMappings` settings.
  - Internal IPC channel strings (`project-memory:*`,
    `persistence:*-project-registry`) and host-action strings — both sides
    match, nothing persisted or external.
  - File names. The follow-up `refactor: rename repository files and internal
    channels` renamed them (for example
    `src/components/layout/RepositoryWorkspaceSidebar.tsx`).
- [x] MCP tools renamed (external): `stave_list_projects` →
      `stave_list_repositories`, `stave_register_project` →
      `stave_register_repository`, `stave_list_project_memories` →
      `stave_list_repository_memories`. The read-only allowlist already only
      auto-allowed the memory read, which maps across cleanly.
- [x] Temporary migration `repository-persisted-state`
      (legacy-repository-state.ts (removed), removeInVersion 0.22.0) maps the
      persisted zustand keys `recentProjects`/`projectPath`/`projectName` on
      rehydrate so the registered-repository list and current selection
      survive. Test: legacy-repository-state.test.ts (removed).
- [x] Fixed by hand after the mechanical pass: ~10 object-literal keys the
      language service could not link to a renamed type, several stale test
      stubs (the `window.api.projectMemory` mock, a `recentProjects` fixture
      key, scripts-config record keys), and architecture/feature doc examples.
- [x] The one isolated test failure (`mergeScriptsConfig`) was a wrongly
      renamed record key in the fixture, reverted.
- Gates: `bun run typecheck`, `node scripts/typecheck-main.mjs`, `test:isolated`
      (5,778 tests, 1 fixed), the static checks, `bun run test:ci`.

BREAKING CHANGE footer lists the three renamed MCP tools.

**Original single-PR sketch (superseded by 5a/5b above):**

- Codemod rule set `repositories`, AST-scoped:
  - identifiers `project*` → `repository*` (never `projection`)
  - protect `martinProject`, `jiraProject*`, Jira filter fields, the
    TypeScript `project` config, and the cross-repository contracts
    (`stave-sync-v1`, `stave-dispatch-v1`)
- Temporary migrations:
  - `app_state` registry keys and entry fields
  - `project_path` → `repository_path` columns, and the project memory
    tables, indexes and FTS triggers
  - the renderer's persisted keys, the sidebar view value, the Crane
    mappings key and the settings section id
- MCP tools `stave_list_projects`, `stave_register_project` and
  `stave_list_project_memories`, and every `projectPath` parameter, renamed
  under a `BREAKING CHANGE:` footer.
- Architecture and developer docs updated together with the code paths.

The original single-PR notes follow for reference.


**Scope:** 306 files, ~1,900 `projectPath` hits, plus `Project` types and UI
copy.

| Old | New |
| --- | --- |
| `projectPath`, `project_path` | `repositoryPath`, `repository_path` |
| `Project`, `projects`, `registerProject`, `loadNormalizedProjects` | `Repository`, `repositories`, `registerRepository`, `loadNormalizedRepositories` |
| `project-memory*`, table `project_memories`, `project_memory_settings` | `repository-memory*`, `repository_memories`, `repository_memory_settings` |
| MCP `stave_list_projects`, `stave_register_project`, `stave_list_project_memories`, every `projectPath` parameter | `stave_list_repositories`, `stave_register_repository`, `stave_list_memories`, `repositoryPath` |
| Fleet control identity `projectPath + workspaceId + taskId + turnId` | `repositoryPath + …` |
| UI "Projects" sidebar view, Settings → Projects, "Project instructions", "Add project", Crane "Project mappings" | "Repositories", Settings → Repositories, "Repository instructions", "Add repository", "Repository mappings" |
| the Project instructions and Project memory feature pages | `docs/features/repository-instructions.md`, `docs/features/repository-memory.md` |

- [ ] Denylist:
  - Jira project fields and filter chip ("Project" stays: it is Jira's)
  - `martinProject` and `stave_martin_*_project`
  - `package.json` and `tsconfig` "project" keys
  - `scripts/` references to the TypeScript "project"
- [ ] SQLite: `ALTER TABLE … RENAME COLUMN project_path TO repository_path` for
      every table that has it, discovered with `PRAGMA table_info`, plus the
      table renames above. All in one migration with a fixture covering every
      affected table.
- [ ] Settings and local storage keys that embed `project`; the workspace
      session file fields that the host reads (`loadNormalizedProjects`).
- [ ] IPC payload fields and schemas across the contract file list.
- [ ] Keep rename-vocabulary.ts --rule repositories (removed) for one
      release so open branches can replay it.
- [ ] Gate: `bun run test:ci`, `bun run build:desktop`, and a manual smoke
      test: open a repository, create a workspace, run a turn, delegate a task,
      restart.

---

### PR 6 — `feat(playbooks): add playbook schema and starter playbooks`

As-built:

- [x] `src/lib/workflows/`:
  - `schema.ts`: strict zod schema; the `Playbook` types are inferred from
    it. Stage ids are lowercase slugs because they appear in the
    `missionId:stageId:attempt` idempotency key. The runtime accepts the four
    providers (ACP runtimes forward collaboration grants too) and the
    Automations permission modes. Cross-stage rules live in one
    `superRefine`; `playbookNeedsExistingPullRequest` reports a playbook that
    acts on a pull request it does not open.
  - `sign-off.ts`: `deriveStageSignOff` (table only), `resolveStageSignOff`
    (override wins), `isCustomCheckIns` (true only when an override changes
    the derived value) and `listSignOffStageIndexes`.
  - `stage-prompt.ts`: `compileStagePrompt` plus the `AcceptanceCriterion`
    type that the mission domain (PR 7) reuses. It adds a plan rule (no file
    changes) and a publish rule (do it once, check before repeating). A
    retry section with the user's feedback goes right after the stage. Action
    stages throw because they have no prompt.
  - `starters.ts`: the four starters and four stage templates, plus
    `createPlaybookFromStarter` (a deep copy with a fresh id) and
    `createStageFromTemplate` (a unique stage id).
  - `normalize.ts`: `parsePlaybook`, `normalizePersistedPlaybooks` and
    `generatePlaybookId`. Malformed entries are dropped with a diagnostic
    (`console.warn`). A duplicate id is renamed and a duplicate shortcut is
    cleared.
- [x] Design decisions recorded in design §6.1:
  - Starting a mission signs off its first stage, so the first stage never
    waits, even under Every stage.
  - `watch-checks` and `mark-pr-ready` must follow `open-draft-pr` only when
    the playbook opens one. Otherwise they act on the workspace's existing
    PR. Fix failing checks and Address review depend on this; the plan's
    "only after `open-draft-pr`" rule would have rejected both.
- [x] Settings:
  - `settings.playbooks` is wired through the defaults, the rehydrate
    normalization and the `updateSettings` patch path.
  - Deferred `missionDefaults` to PR 11, where the start sheet first consumes
    it. Mission turn caps are stored per mission (PR 7).
  - Dropped the planned settings-dialog registry entry. The builder is a
    Playbooks tab in the Automations center (design §8.6), and a settings
    section without a renderer would break the section map.
- [x] Deleted `WORKFLOW_STARTERS`, which was rendered nowhere. Its content is
      in git history for the Phase 2 starters. `appendWorkflowDraft` stays.
- [x] Tests:
  - `tests/workflow-schema.test.ts` covers the schema, the starters and the
    normalization. It also checks that every `stave_*` tool a starter names
    is registered in `stave-mcp-server.ts` or `browser-tools.ts`, so a future
    tool rename cannot silently break the starters.
  - `tests/workflow-sign-off.test.ts`
  - `tests/workflow-stage-prompt.test.ts`
- Gates: `bun run typecheck`, `node scripts/typecheck-main.mjs`, focused
      tests (36), `bun run test:ci`.

### PR 7 — `feat(missions): add mission domain, supervisor policy and storage`

As-built:

- [x] `src/lib/agent-runs/domain.ts`: zod schemas for the mission, stage attempt
      records, stage reports (the `stave_report_stage` / `stave_block_stage`
      inputs are exported for PR 8), Stave-collected facts, action results and
      events, plus the aggregate helpers.
  - The consent records `checkIns`, `permissionMode` and
    `authorizedEffectStageIds`: the publish stages and Stave actions the user
    authorized at start. `MissionStartInputSchema` rejects ids that are not
    external-effect stages.
  - `enterStage` reuses a record that never started (pending or awaiting
    sign-off). Otherwise it opens a new attempt, capped at 20, so returning
    to a finished stage never rewrites its history.
  - Additions to the planned SQL: `project_id` (nullable now, which avoids a
    migration in Phase 3), `fingerprint_json` (the runtime-changed pause
    needs it), and the stage columns `block_reason`, `detail`, `feedback` and
    `report_revision`.
  - New tables use `repository_path`, not `project_path`.
- [x] `policy.ts`: `decideMissionAction` and `applyMissionDecision`. Choices
      that refine the plan:
  - The turn cap is checked only before starting a turn (stage start or
    nudge), never before completing. A final report that lands on the last
    allowed turn still completes.
  - `lastEndedTurn` carries who started the turn:
    - A user turn with the `continue` intent that ends without a report
      continues the stage: `start-stage-turn`, reason
      `continue-after-user`.
    - A mission turn that ends without a report is nudged once, then marked
      stuck.
    - A report counts only if it is newer than the last ended turn.
  - The same rule covers a blocked stage: a reply resumes it.
  - Unreachable reporting blocks with `reporting-unavailable` instead of
    nudging. When reporting comes back, the stage restarts with reason
    `reporting-restored`, without spending the nudge.
  - `resolveMissionStageSignOff` uses the consent's check-in level. A stage
    with an external effect that the consent does not list always asks.
  - A repeated pause with the same reason is idle, so events do not pile up.
  - `MISSION_DECISION_EFFECTS` is an exhaustive record that makes the
    decision set enumerable for statement 8.
  - The plan's `request-sign-off.stageIndex` was dropped (always the current
    stage). `start-stage-turn` gains a `reason` field for the
    retrieved-context part in PR 8.
- [x] `commands.ts` (new; not in the plan). Pure user commands, each refused
      with a `MissionCommandError` sentence:
  - `signOffStage`
  - `requestStageChanges`: reruns the previous AI stage at attempt + 1 with
    feedback; the stages after it rerun as new attempts.
  - `skipStage`
  - `retryStage`
  - `pauseMission` (`paused-by-user` / `taken-over`) and `resumeMission`.
    Supervisor pauses clear themselves.
  - `acceptMissionRuntime` ("Apply to remaining stages")
  - `cancelMission`
  - `recordStageReport`: identity from the grant, at most 5 revisions.
- [x] `evidence.ts`: "Verified by Stave" requires one of:
  - a cited tool call with `ok` true
  - a cited command that exited 0 (compared after normalizing whitespace)
  - a command's tool call id

  Action results are always verified.
- [x] `report.ts`: builds the report from the latest attempt of each stage:
  - Action evidence comes first.
  - Links are deduplicated, and a Stave-verified link beats an
    agent-reported one.
  - The acceptance criteria come from the last stage that reported them.
  - For cancelled or stopped missions, `leftBehind` lists the pushed branch
    and the open PR from a `MissionWorkspaceState` that PR 8 reads.
- [x] `lanes.ts`, plus `missionLane` in `SidebarWorkQueueSignals`. The mission
      lane competes with the task's own signals by priority, so a workspace
      still lands in exactly one lane. Two cases beyond the design table:
  - A stopped mission maps to `action-required`, because it ended short of
    its goal.
  - A mission paused by the user returns no opinion.
- [x] `src/lib/supervision/automatic-turn-owner.ts`:
  - The wake-up pause reason `mission-active` is automatic: it pauses while
    a mission is running or paused and resumes when the mission ends.
  - The wake-up runtime has an optional dependency,
    `getActiveMissionForTask`, which PR 8 wires. Create, update and resume
    are refused with a sentence while a mission is active.
  - `docs/features/wake-ups.md` was updated.
- [x] `electron/persistence/agent-run-store.ts`:
  - Transitions are written inside a SAVEPOINT (the pattern the wake-up
    store uses).
  - A partial unique index enforces one active mission per lead task, and
    `create` returns `SECOND_MISSION_REFUSAL`.
  - Keyed events are recorded with `INSERT OR IGNORE`, and `hasEvent` exposes
    them.
  - At most 2,000 events are kept per mission, and keyed events are never
    pruned.
  - An unreadable row is skipped in listings with a warning.
  - The store is not yet constructed in `sqlite-store.ts`; PR 8 wires it
    with the runtime. `sqlite-store.ts` is at its line ratchet.
- [x] Taxonomy:
  - New vocabulary rows: Repository, Playbook, Stage, Check-ins, Sign-off,
    Mission, Stage report, Mission report, and Project (reserved for the
    coordinator).
  - A Layer 3 "Procedure" row.
  - A paragraph on the mission as a supervisor entry and the one-owner rule.
  - Statements 8–11. Statement 10 is marked as recorded ahead of its gate
    (PR 11).
  - The prototype's "no second executor" sentence never reached main, so
    there was nothing to replace.
  - Fixed a stale `Projects` sidebar view name.
- [x] Gate `mission-supervision-boundaries` (statements 8, 9 and 11), with
      tests named after the statements in `agent-platform-boundaries.test.ts`.
- Tests:
  - `mission-policy` (19)
  - `mission-commands` (11)
  - `mission-store` (8)
  - `mission-report` (evidence, report and lanes)
  - `automatic-turn-owner`
  - additions to `wake-up-runtime`, `wake-up-policy`,
    `fleet-sidebar-work-queue` and `agent-platform-boundaries`
  - fixture `tests/fixtures/agent-run-fixtures.ts`
- Gates: typecheck, typecheck-main, focused tests (209), `bun run test:ci`.

### PR 8 — `feat(missions): run ai stages from the host supervisor`

As-built:

- [x] Files beyond the plan:
  - `electron/host-service/supervision/agent-run-host.ts` builds the runtime
    from real dependencies, so `host-service.ts` gets wiring lines only.
  - `electron/host-service/supervision/local-mcp-reachability.ts`: the Local
    MCP `/health` probe, cached for 10 seconds.
  - `electron/providers/agent-run-grants.ts`: the grant registry (host
    process, beside the advisor and worker registries).
  - `src/lib/agent-runs/briefing.ts` (stage prompt, reminder, context part,
    `stave_get_mission` briefing, consent → provider permissions),
    `src/lib/agent-runs/facts.ts` (pure fact extraction) and
    `src/lib/agent-runs/api.ts` (renderer/main/host contract and IPC channel
    names).
  - `electron/host-service/delegated-task-signals.ts`: the delegated-task
    feed moved out of `local-mcp-runtime.ts`, which also gives missions the
    active-delegation count. It offsets the ratchet: `local-mcp-runtime.ts`
    2849 → 2758. `sqlite-store.ts` exposes `missions` (3044 → 3042 after
    tightening one callback).
- [x] Grants:
  - The grant module gains `missionKey`, `x-stave-mission-key` and
    `MISSION_GRANT_ENV` (`STAVE_MISSION_GRANT_KEY`). The follow-up commit
    `99f37ba6` (`refactor(providers): rename collaboration grants to turn
    grants`) renames it to `stave-turn-grants.ts`, as planned, with
    `StaveTurnGrants`, `turnGrantHeaders`, `staveTurnGrants` and `turnGrants`.
    Fold that commit into PR 8 at publish time.
  - `runtime.ts` mints the grant only for Claude and Codex turns that carry
    `missionStage`, and never for secondary runs. Every exit path revokes it
    through `revokeCollaborationGrants`.
  - Claude gets a fresh key per turn. Codex keeps one key per task, like the
    Advisor channel: a resumed Codex thread keeps its first MCP catalog, so a
    changing key would start a fresh thread on every stage. Later turns keep
    sending the key, and it resolves to nothing outside a mission turn.
  - The Codex collaboration profile includes the mission key.
  - The renderer's `StreamTurnArgsSchema` is strict, so it rejects
    `missionStage`. A test pins this.
- [x] Runtime (`agent-run-runtime.ts`):
  - One serialized chain for ticks, commands and reports. `requestTick`
    returns the tick's promise.
  - Ticks come every 5 seconds, when a host-run turn reports `done`, and
    when a composer turn completes.
  - Turn state comes from the `turns` table, which records composer turns
    before the host's session cache knows about them.
  - A turn is "mission" when a `turn-linked` event names it.
  - `lastEndedTurn` is the newest ended turn created since the attempt
    started.
  - Up to 8 decisions without I/O run per evaluation, and a started turn
    ends the evaluation.
  - Starting a turn writes the turn count, the stage record (with
    `start_head_sha`) and the keyed `turn-started` event in one transaction.
    After `runSupervisedTurn`, a `turn-linked` event records the turn, or a
    `turn-failed` event records the failure. Both use keys of the form
    `<turnKey>:linked` and `<turnKey>:failed`, and are new event kinds.
  - When a start fails, the stage is marked stuck and the user is notified,
    unless a user turn began in the meantime.
  - Boot sweep:
    - It closes the latest linked mission turn if it is still open.
    - A `turn-started` event with no outcome gets a `turn-failed` event,
      marks its stage stuck and notifies once. It is never replayed.
  - Policy fix: a stuck stage with no ended turn idles. Without this, an
    interrupted start would replay. A reply still resumes the stage.
  - Stage facts are refreshed once per newly ended turn, before the policy
    acts:
    - They are read from persisted message tool parts. Turn events are
      compacted when a turn completes, so they cannot be used.
    - Commands come from Claude `Bash` JSON input and Codex `bash`.
      Providers report success, not exit status, so a failure is recorded as
      exit code 1.
    - The diff comes from `git diff --shortstat <start sha>` and counts
      tracked files only.
  - `consent.permissionMode` sets the provider permissions of mission turns:
    - Guided asks before sensitive actions, and the mission waits on the
      approval.
    - Auto bypasses prompts on Claude and sets `never` on Codex.
    - Manual keeps the runtime's own settings.
  - The fingerprint is the lead task's runtime at start. The playbook's
    runtime is applied by the start sheet (PR 11).
  - Start is refused in these cases, with code `refused`:
    - the task is not Claude or Codex
    - the task is archived or missing
    - Local MCP is unreachable
    - a mission is already active on the task
  - Accept-runtime is refused for runtimes other than Claude and Codex.
  - Action stages go through an optional `performAction` dependency, which
    PR 9 wires. Until then an action stage blocks with a sentence. A
    succeeded result is stored in `facts.action`.
  - The Mission report is built on `get` once the mission has ended. A
    partial report reads the branch, its upstream and the open PR (through
    `fetchGitHubPrStatus`).
- [x] Contract:
  - The host returns `MissionInvokeResult` (`{ ok, value }` or
    `{ ok: false, code, message }`), so a refusal code such as
    `stale-identity` survives the process boundary.
  - Stage commands (sign-off, request changes, skip, retry) carry
    `{ missionId, stageId, attempt }`. Mission-level commands carry only
    `missionId`: pause, resume, take over, accept runtime, note user turn and
    cancel. A stale stage does not make these wrong.
  - IPC adds `missions:retry-stage`, `missions:pause` and
    `missions:accept-runtime` for commands PR 7 already had.
- [x] Notifications:
  - A failed or interrupted mission turn reuses `task.turn_failed`, with
    `payload.source: "mission"`.
  - `notifySupervisorProblem` generalizes the wake-up notifier.
  - New attention kinds and OS notifications stay in PR 12.
- [x] Docs:
  - `provider-runtimes.md` has a mission-grant paragraph.
  - The taxonomy's mission paragraph names the runtime and the grant.
  - The file list in `wake-ups.md` follows the moved completion feed.
- Tests:
  - `mission-runtime` (19)
  - `mission-tools` (6: tool gating, no ids, refusals, grant registry, the
    renderer schema)
  - `mission-briefing` (10: prompts, briefing, permissions, facts,
    reachability)
  - `provider-runtime-mission-grant` (4: Claude and Codex symmetry)
  - additions to `mission-policy`, `codex-thread-session`,
    `stave-local-mcp-manifest` and `codex-turn-local-mcp`
- Found while building this slice:
  - PR 5b left free-text references to `stave_list_project_memories`,
    `stave_register_project` and `stave_list_projects`.
  - One of them is in the repository memory context injected into every
    turn.
  - Fixed in the separate commit `40866591` (`fix: name the renamed
    repository tools in prompts and docs`), with a test that every tool the
    instructions and the memory context name is registered. Fold it into
    PR 5b at publish time.

### PR 9 — `feat(missions): perform pull request stages as stave actions`

As-built:

- [x] Files beyond the plan:
  - `electron/host-service/supervision/agent-run-scm.ts`: the source-control
    port on `scm-runtime` and `gh`, plus `describePushFailure`.
  - `src/lib/agent-runs/pull-request-draft.ts`: the commit message and the PR
    title and body.
- [x] `agent-run-actions.ts`:
  - `performAction` runs on every tick while an action stage runs and no
    turn is active, and picks up from remote and local state each time.
  - The `action-started` key is written before any remote call.
  - `action-finished` is written under `<key>:finished`. Repair pushes use
    `<key>:repair:<n>:pushed`.
  - After a restart, the next call resolves an unfinished action by reading
    remote state first, so the boot sweep needs no extra step. An existing
    open PR is adopted, and a PR that is already ready is left alone.
  - Missing `gh` authentication, a protected branch and a rejected push fail
    the action with Stave's sentence, which blocks the stage.
- [x] Open draft PR:
  - It adopts the branch's open PR.
  - Otherwise it commits leftover changes, pushes with `--set-upstream`, and
    creates the draft. A PR that `gh` reports as existing is adopted.
  - The commit message, title and body are built without a model. The
    model-drafted versions in the Open PR dialog need the renderer's utility
    runtime settings, which the host does not have.
  - The title comes from the branch's conventional commit subjects, which
    the Verify stage writes, and falls back to one derived from the branch
    name.
  - The body lists the assignment, the stage summaries and the acceptance
    criteria.
  - The fallback commit message is `chore: <assignment>`.
- [x] Watch checks:
  - It reads `gh pr checks --json name,state,link,startedAt` and the PR's own
    merge fields, never the derived `WorkspacePrStatus`.
  - It polls once a minute, and records a `checks-observed` event only when
    the observation changes.
  - Observation order: no PR, closed, conflict (`CONFLICTING` or `DIRTY`),
    behind (`BEHIND`), failing, pending, then passed or no checks.
  - No checks completes only after a 2-minute grace period for a fresh
    head.
  - A check pending past `timeoutMinutes` is stuck, named with its age.
    GitHub's year-one `startedAt` for a queued check is ignored.
  - Requested changes are recorded in the observation without stopping the
    watch.
  - Three failed reads in a row block the stage; fewer are waited out.
  - All checks count, not only required ones: `gh pr checks` does not
    report which checks are required in this JSON.
- [x] Repair turns:
  - The policy gains `ActionOutcome.needs-turn` and the decision
    `start-action-turn`. It is capped by `maxTurns` and idles while a turn
    runs.
  - The runtime starts the turn with the repair prompt, a
    `repair-checks` context part and no mission grant, because the turn
    reports no stage.
  - After the turn, the action commits (`fix: address failing checks`),
    pushes, and records the pushed head. It then waits up to 10 minutes for
    GitHub to show that head before reading checks again.
  - When the repairs run out, checks that still fail block the stage.
- [x] `readPullRequestChecks` in `scm-runtime.ts` reads the rows from stdout
      even when `gh` exits non-zero, and treats "no checks reported" as an
      empty list.
- [x] The runtime ends an evaluation when an action is still in progress,
      instead of calling it again within the same tick.
- Tests:
  - `mission-checks` (12: `gh` parsing with fixtures, state buckets,
    observation order, every row of the watch decision, PR text, push
    failure sentences)
  - `mission-actions` (12: executor with a fake port and a real store)
  - `mission-policy` (+1: action turns and the turn cap)
  - `mission-runtime` (+1: repair turn end to end)
  - fixtures `tests/fixtures/pr-checks/{passing,failing,pending}.json`

### PR 10 — `feat(missions): show missions in turn activity, panel and transcript`

As-built (PR 10a):

- [x] Renderer state in `src/store/agent-runs-store.ts`:
  - It holds the latest mission per task in the active workspace (active
    first), its detail, and its transcript dividers.
  - Commands return the mission after they run. A `stale-identity` refusal
    refreshes the mission.
  - `useMissionSync` is mounted once in `App.tsx`. It loads the workspace on
    switch, applies `missions:changed`, and opens the Mission panel when a
    mission starts on the task in view.
- [x] Pure projections:
  - `src/lib/agent-runs/now-line.ts`: plain phrases from tool activity, and a
    1.5-second hold.
  - `src/lib/agent-runs/agent-run-view.ts`: stage rows with Stave's evidence
    first, the one headline with its age, and transcript dividers built from
    events.
  - `src/lib/agent-runs/report-markdown.ts`.
  - `CHECK_IN_LABELS` is added to the playbook schema.
- [x] Mission bar (`AgentRunBar.tsx`):
  - The stepper is an ordered list with `aria-current="step"`, and stages
    that ask first carry a hand marker.
  - A container query collapses the bar to "Verify · 3 of 6".
  - While a turn runs, the Now line comes from the latest tool row.
    Otherwise the wait is named and aged.
  - A completed stage holds for 3 seconds, except under reduced motion.
  - A polite live region announces stage changes and sign-off requests only.
  - The bar shows only while a mission is active.
  - Placement: the bar renders in the docked host for the docked and
    floating placements, and in the Activity panel for the panel placement.
    The floating card stays the turn shelf alone.
- [x] Mission panel (`AgentRunPanel.tsx`):
  - The right-rail id `collaboration` becomes `mission`, titled "Mission".
    A registered temporary migration `right-rail-mission-panel` maps saved
    layouts.
  - The collaboration components moved to `src/components/team/`, and
    `CollaborationPanel` became `TeamSection`, which renders below the
    mission.
  - The panel shows goal, status and age, check-ins, and Done when with
    sign-off attribution, then the stage cards and, once the mission ends, the
    report.
  - Controls: Pause, Resume (user pauses only), Apply to remaining stages
    (runtime-changed), Cancel, and Retry or Skip on a blocked or stuck stage.
  - Stage cards show:
    - the detail sentence
    - the summary
    - decisions with reasons
    - evidence, Verified by Stave first, with "Show in transcript" for a
      cited tool call
    - artifacts
    - diff facts
    - the instruction snapshot
- [x] Sign-off card and reply chip:
  - They render in the docked Turn Activity host, which already sits just
    above the composer in both composer modes, instead of inside
    `ChatInputComposer.tsx`. That file is at its line ratchet.
  - The sign-off primary button names the consequence. It offers Review
    changes, which opens Source Control, and Ask for changes, offered only
    when an earlier AI stage exists.
  - The reply chip replaces "note the intent before send" with direct
    controls. Take over pauses the mission now (`taken-over`), and Resume
    mission hands the task back. A reply without Take over continues the
    stage, which is the host's default, so the send path is unchanged.
  - `missions:note-user-turn` stays available.
- [x] Transcript dividers:
  - `ChatPanel` maps each user message to the turn it started.
  - `StageDivider` renders the divider built from mission events, for
    example "Stage 3 · Verify — started automatically after Build reported
    done", or "— signed off by you at 13:41".
- [x] Task Results shows the task's latest finished Mission report on top,
      with Copy Markdown.
- [x] Dev preview `?stavePreview=mission` renders every state from fixtures.
- [x] Lens pass on the preview: live, sign-off bar and card, blocked, stuck,
      reporting unavailable, narrow and reduced motion, panel, ended
      mission, report. Checked in light and dark.
  - Fixed during the pass:
    - active icons used the on-accent text token and were invisible
    - the wait headline repeated its label
    - a cancelled stage's sentence was red
    - evidence rows were at body size
  - The web app shell was checked for errors with the new hooks.
  - Not checked: a live mission in the Electron app, because no start
    surface exists before PR 11.
- [x] Theme: existing ADS tokens only; no new theme tokens.
- Deferred to PR 10b or later, as recorded:
  - report actions: Add to PR description, Save decisions to memory
  - wake-up visibility and its IPC
  - the in-stage todo figure (it needs a message scan on the hot path)
  - Work map inside a stage (in the archived prototype)
  - Hand off above the team section (it needs the Start sheet, PR 11)
  - the Advisor critique on sign-off cards (`advisorReview` is not wired to
    a runtime)
  - dividers cover the latest mission of a task and its newest 200 events
- Tests:
  - `now-line` (4)
  - `mission-bar` (9, with the view projections and dividers)
  - `mission-panel` (6, with the sign-off card)
  - `mission-report-view` (2)
  - `right-rail-panel-migration` (1)
  - existing Turn Activity, chat panel, layout and results tests pass
  - the Electron e2e panel name is updated
- Gates: typecheck, typecheck-main, `check:design-system`, `check:style-channel`
  and every check script, `bun run test:ci` (689 files, both builds).

### PR 10 — `feat(missions): show missions in turn activity, panel and transcript`

As-built (PR 10b and the design pass):

- [x] `96ed690a feat(missions): add mission report actions and show wake-ups`:
  Add to PR description (marker-delimited, replaced on repeat), Save
  decisions to memory (candidates), wake-up IPC (`wake-ups:list`,
  `set-paused`, `remove`, `changed`), Wake-up section in the Mission panel,
  a mission/wake-up mark on the task tab.
- [x] `731b2510 feat(missions): give mission surfaces one layout and
  hierarchy` (fold into PR 10b when publishing):
  - `StageTrack.tsx`: one segment per stage, colored by status, names under
    it when wide; shared by bar, panel and Fleet.
  - Mission bar is a shelf (`turn-activity-surface`, top radius, 0.75rem
    tuck) that shares the turn header geometry (12px inset, 24px mark slot,
    10px gap) so both lines start in one column. It leads with
    `describeMissionStatusLine` (stage · state · detail · age), carries Take
    over / Resume / Open panel; the reply chip was removed.
  - Sign-off card moved to `ChatInputComposer`'s approval slot (shown when no
    tool approval is pending), styled like the approval card with an
    accent-leaning edge, titled as a question.
  - Mission panel: goal-first header with a state badge
    (`describeMissionBadge`), Done-when checklist, StepRail timeline with
    folded instructions, Cancel in an overflow menu, details footer.
  - Report: outcome tile, four figures, links, grouped sections; in the panel
    it omits what the header already says (`context="panel"`).
  - Lens-checked on the preview (composer mock, bar states, panel, report,
    wake-ups, dark theme). `color-mix` uses `oklab` (oklch drifted pink).

### PR 11 — `feat(playbooks): add the playbook builder and start mission sheet`

As-built (PR 11, `df5b3a5d`):

- [x] Playbooks tab (`src/components/workflows/`): searchable list + in-place
  editor; per-playbook unsaved drafts; templates gallery empty state; Draft
  with AI (a playbook drafting module + utility-lane read-only turn,
  since removed); stage rows with drag and
  Alt+arrow reorder, sign-off hand toggle (`setStageSignOff` removes an
  override that matches the preset), inline Stave action settings (deviation:
  no side pane); validation grouped by field on Save.
- [x] Start sheet (since removed): assignment first, playbook +
  stage rail (Starts now / Automatic / Asks you, globe for external
  effects), check-ins, a separate "Acts outside this machine" checkbox list,
  per-start permissions, "Edit stages for this mission" (this time / save as
  new), pre-start checks (since removed). Primary
  button from `describeStartButton`. Uncertain start replies are re-checked
  (`missions-store.startMission`). Frozen target via `playbooks-ui-store`.
  Deviation: no Start at stage (domain has no start index).
- [x] Entry points: `handOff` composer control (since removed;
  registered in `composer-controls.ts`, rendered by `prompt-input.tsx`),
  `!shortcut` playbook entries in the macro palette, command palette
  contributor (useMissionCommands.ts, removed), Mission panel empty state, Playbook
  field in KickoffDialog and the Issues kickoff sheet (both open the sheet on
  the new task so consent is collected there).
- [x] Gate `mission-start-consent` (statement 10) registered; taxonomy
  updated. `resolveConsentStageSignOff` shared by the sheet preview and the
  policy.
- [x] Tests: mission-start-consent, pre-start-checks, playbook-library,
  playbook-editor, e2e playbooks (4, run locally with Playwright).

### PR 12 — `feat(fleet): route mission attention, lanes and notifications`

As-built (PR 12, `688f210b`):

- [x] `src/store/fleet-agent-runs-store.ts`: active missions across workspaces
  (list + get, `missions:changed`), raises mission notifications through
  `persistRendererNotifications` (sound, OS notification, toast; announced
  only when newly stored), batched sign-off reminder
  (`settings.missionSignOffReminderMinutes`, default 30, Settings → General →
  Desktop Notifications).
- [x] Notification kinds unified in `APP_NOTIFICATION_KINDS` (IPC schema,
  renderer DB adapter, SQLite store); added `mission.sign_off_requested`,
  `mission.blocked`, `mission.stuck`, `mission.completed`
  (`src/lib/agent-runs/notifications.ts`). Deviation: renderer-raised rather
  than host-raised, because only renderer notifications get OS
  notifications and sounds.
- [x] Fleet attention kinds `mission-sign-off` / `-blocked` / `-stuck`
  (blocking, ordered with approvals), a sign-off button on the Fleet row
  (same command and identity check), `FleetMissionStrip` on workspace cards,
  mission lanes in the work queue (`useSidebarWorkQueueGroups`).
- [x] Turn budget on sign-off cards and the panel (deviation: no spend yet).
- [x] Ratchets lowered: `schemas.ts` 1620, `notification-store.ts` 488,
  `RepositoryWorkspaceSidebar.tsx` 2101, general settings section 463.

### PR 13 — `test(missions): cover request to pr end to end and document missions`

As-built (PR 13, `f422f0a2`):

- [x] `tests/agent-run-scenarios.test.ts`: A1 (two sign-offs only, draft PR,
  one repaired check, verified links/evidence), A4 (reply continues, Take
  over pauses), A5 (Codex). A2/A3/A6 stay in `agent-run-runtime.test.ts` and
  `agent-run-actions.test.ts`.
- [x] `tests/e2e/agent-runs.e2e.ts` on the preview (4).
- [x] `MissionReport.metrics` from events (replies, nudges, stuck, sign-off
  waits) in the report footer and Markdown. Deviation: no diagnostics view.
- [x] Docs: `docs/features/agent-runs.md`, `playbooks.md`, public docs
  entries, entrypoints and code-organization rows, design §15 As Built.

### PR 14 — `feat(projects): add project domain, storage and coordinator policy`

As-built (PR 14, `b0a0c8d7`):

- [x] lib/projects/domain.ts (removed) (projects, settings, proposals, events,
  memory, `StartMissionToolInputSchema`, `PROJECT_LIMITS`), `policy.ts`
  (`decideProject`, delivered-state keys, wake prompt) and `briefing.ts`
  (coordinator instruction, read-only runtime options, tool names).
- [x] persistence/project-store.ts (removed) with `projects`,
  `project_proposals`, `project_events` and `project_memories`.
  Deviation: proposals replace `project_missions`; a project mission is an
  ordinary mission with `projectId` (`listMissionsForProject`).
- [x] providers/project-grants.ts (removed), the project runtime skeleton,
  `createIdleTask` extracted into `electron/host-service/local-mcp-pending.ts`.
- [x] Boundary statement 12 and gate `project-boundaries`.
- Deviation: no coordination playbook starter. The coordinator is an ordinary
  task the project runtime wakes, with a coordination-only instruction.

### PR 15 — `feat(projects): let coordinators start and review missions`

As-built (PR 15, `154c22cd`):

- [x] Project grant key (`x-stave-project-key` / `STAVE_PROJECT_GRANT_KEY`)
  beside the mission key on every coordinator turn, Claude and Codex; tools
  registered only when the key is present.
- [x] Tools `stave_get_project`, `stave_start_mission`, `stave_list_missions`,
  `stave_get_mission_report`, `stave_note_project`.
- [x] Approve/reject, pause/resume/end, settings, memory status over IPC
  (ipc/projects.ts (removed), preload `projectsApi`); playbooks synced
  from renderer settings (usePlaybookSync.ts, removed).
- [x] Start keys are idempotent; a start is recorded before its side effects.

### PR 16 — `feat(projects): wake coordinators when their missions change`

As-built (PR 16, `f7f65273`):

- [x] Mission changes reach `projectRuntime.notifyMissionChanged`; the
  coordinator wakes on ended / awaiting sign-off / blocked / stuck, once per
  delivered state, coalescing while it is in a turn.
- [x] Daily cap (`maxCoordinatorWakesPerDay` 24) pauses the project with a
  reason; a failed wake is reported once.

### PR 17 — `feat(projects): scope memory and collect a project library`

As-built (PR 17, `a331b3d3`):

- [x] Accepted memory reaches missions of the project only
  (`readProjectContext`); decisions from completed missions become
  candidates unless auto-accept is on.
- [x] Library links from mission reports, classified and grouped by mission.

### PR 18 — `feat(projects): add the project home, sidebar list and fleet rollup`

As-built (PR 18, `0cbffec0`):

- [x] components/projects (removed): Projects view (list + picker below 60rem),
  project home (header chips, coordinator summary, Needs you / Running / Done
  lanes on one row grid, Memory / Library / Settings tabs), New project dialog
  (goal, coordinator choice, ask-first option), Fleet rollup.
- [x] `SidebarPrimaryNav` (Fleet View, Projects and open projects),
  `openProjects` app surface, palette entries, `useProjectsSync`.
- [x] Preview `?stavePreview=projects` (`&empty=1`); Lens pass light and dark.
- Deviations: the coordinator conversation opens in its task (**Open
  coordinator**) rather than docked; start conditions, per-project usage and a
  collapsed-sidebar entry are not built; project missions run on the
  provider's default model.

### PR 19 — `test(projects): cover a two-mission project end to end and document projects`

As-built (PR 19):

- [x] project-scenarios.test.ts (removed): P1 (two missions, Claude and Codex,
  separate worktrees, after approval), P2 (one wake for both, reports read,
  next proposed), P3 (accepted decision recalled in-project only), P4
  (relaunch starts nothing twice, does not re-wake, mission continues).
- [x] features/projects.md (removed), public docs entry, entrypoints and
  code-organization rows, design §16 As Built, promoted plan copy.
- Deviation (P4): quitting stops the runtimes instead of recording a paused
  state; relaunch resumes.

## Follow-ups After The Plan

Built after the twenty changes, closing deviations the As-built notes list:

- [x] `feat(missions): show what missions and projects spend` —
  `src/lib/agent-runs/usage.ts` sums provider-reported turn usage; the sign-off
  card, Mission panel, report, Fleet strip and project home show it.
- [x] `feat(missions): start a mission at a later stage` — **Start at** in the
  Start sheet; earlier stages are recorded as skipped.
- [x] `feat(projects): choose the model a project mission runs on` — a model in
  `stave_start_mission` and a provider/model picker on proposals;
  `electron/host-service/idle-task.ts` opens the mission's task on it.
- [x] `feat(projects): add projects to the collapsed sidebar`.
- [x] `feat(projects): start projects from events and talk to the coordinator
  in place` — **Starts when** (assigned issues, mission PR feedback, a
  schedule) wakes the coordinator through `collectPendingTriggers`, with seen
  occurrences kept in `project_trigger_seen`; the coordinator conversation
  docks beside the project.
- [x] `feat(projects): pause projects on quit and end them on a date` —
  quitting pauses active projects with a marked reason and relaunch resumes
  exactly those; an end date expires a project.
- [x] `feat(projects): search the library and link it from Information`.
- [x] `feat(missions): compare missions per playbook and provider` —
  `src/lib/agent-runs/insights.ts` and **Mission insights** in the Playbooks tab.
- [x] `feat(playbooks): add templates for work beyond pull requests`.
- [x] `feat(missions): save a mission as a playbook and share its report to
  Slack`.
- [x] `feat(playbooks): run a workspace script as a stage` — the `run-script`
  action.
- [x] `feat(playbooks): propose missions from start conditions and triage` —
  **Starts when** on playbooks (assigned issues, a workspace's pull request
  needing work, a schedule, **Start on its own**), evaluated by
  supervision/proposal-runtime.ts (removed) with occurrences in
  `mission_trigger_seen` and proposals in `mission_proposals`; Issues →
  **Proposed**, Fleet's **N proposed**, `stave_propose_mission` and the
  **Triage requests** template.
