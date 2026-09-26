// temporary-migration: rename-vocabulary-codemod
/**
 * Replays Stave's vocabulary renames on any branch, so work that started
 * before a rename landed can be brought onto the new names mechanically.
 *
 *   bun scripts/codemods/rename-vocabulary.ts <rule-set> [--dry-run]
 *
 * A rule set renames files with `git mv` and rewrites identifiers, paths,
 * IPC channels and tool names in tracked text files. It deliberately leaves
 * persisted legacy names, history (CHANGELOG) and design records alone;
 * the data migrations that read old names live in the product code and are
 * registered in `config/temporary-migrations.json`.
 *
 * Two kinds of rules exist:
 * - `replacements` are unambiguous compounds (`TaskHeartbeat`, `routine`)
 *   rewritten everywhere.
 * - `scoped` rules handle a bare word that also has other meanings elsewhere
 *   (a Crane job "heartbeat", a Jira "project"). They run only in the listed
 *   files, and TypeScript sources are parsed so identifiers get code casing
 *   (`wakeUp`) while comments and strings get prose (`wake-up`).
 *
 * Prose that keeps the old word in its ordinary sense is protected phrase by
 * phrase. Always review the diff and the collision report after a run.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

type Replacement = readonly [pattern: RegExp, replacement: string];

interface ScopedRules {
  /** Paths after this rule set's file renames. */
  files: readonly string[];
  identifierRules: readonly Replacement[];
  proseRules: readonly Replacement[];
}

interface RuleSet {
  description: string;
  fileRenames: ReadonlyArray<readonly [from: string, to: string]>;
  /**
   * Applied in order to every tracked path; a path that changes is moved.
   * Useful for whole directories and families of test files.
   */
  pathRenames?: readonly Replacement[];
  /** Tracked paths that keep their name even when a path rule matches. */
  keepPaths?: readonly string[];
  /** Exact phrases where the old word keeps its ordinary meaning. */
  protectedPhrases: readonly string[];
  replacements: readonly Replacement[];
  scoped?: ScopedRules;
}

const ALWAYS_EXCLUDED = [
  /^CHANGELOG\.md$/,
  /^bun\.lock$/,
  /^config\/temporary-migrations\.json$/,
  /^docs\/superpowers\/specs\/2026-09-26-projects-missions-playbooks-design\.md$/,
  /^scripts\/codemods\//,
];

const TEXT_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|json|md|yml|yaml|css|html)$/;
const MARKER_KEYWORD = ["temporary", "migration"].join("-");
/**
 * A marked migration block (from its `<keyword>: <id>` line to its
 * `end <keyword>: <id>` line) holds legacy names on purpose and is never
 * rewritten. Tests that exist only for a registered migration are skipped for
 * the same reason.
 */
const MARKED_BLOCK = new RegExp(
  `^[^\\n]*(?<!end )${MARKER_KEYWORD}: ([a-z0-9-]+)[^\\n]*\\n[\\s\\S]*?^[^\\n]*end ${MARKER_KEYWORD}: \\1[^\\n]*$`,
  "gm",
);

function registeredMigrationTests() {
  const registryPath = "config/temporary-migrations.json";
  if (!existsSync(registryPath)) return new Set<string>();
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
    migrations?: Array<{ tests?: string[] }>;
  };
  return new Set((registry.migrations ?? []).flatMap((entry) => entry.tests ?? []));
}

/** Swaps marked blocks for inert comments while `transform` runs. */
function withMarkedBlocksProtected(source: string, transform: (text: string) => string) {
  const blocks: string[] = [];
  const masked = source.replace(MARKED_BLOCK, (block) => {
    blocks.push(block);
    return `/*\u0000BLOCK_${blocks.length - 1}\u0000*/`;
  });
  return transform(masked).replace(
    /\/\*\u0000BLOCK_(\d+)\u0000\*\//g,
    (_, index: string) => blocks[Number(index)],
  );
}
const SCRIPT_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;

const RULE_SETS: Record<string, RuleSet> = {
  automations: {
    description: "Routine → Automation",
    fileRenames: [
      ["src/lib/routines.ts", "src/lib/automations.ts"],
      ["electron/host-service/routine-runtime.ts", "electron/host-service/automation-runtime.ts"],
      ["electron/main/routine-service.ts", "electron/main/automation-service.ts"],
      ["electron/main/ipc/routines.ts", "electron/main/ipc/automations.ts"],
      ["src/components/layout/TopBarRoutines.tsx", "src/components/layout/TopBarAutomations.tsx"],
      [
        "src/components/layout/RoutineInformationResourceCreator.tsx",
        "src/components/layout/AutomationInformationResourceCreator.tsx",
      ],
      [
        "src/components/layout/routine-information-resource-creator.styles.ts",
        "src/components/layout/automation-information-resource-creator.styles.ts",
      ],
      ["tests/routines.test.ts", "tests/automations.test.ts"],
      ["tests/routine-runtime.test.ts", "tests/automation-runtime.test.ts"],
      ["tests/routine-result-navigation.test.ts", "tests/automation-result-navigation.test.ts"],
      ["docs/features/routines.md", "docs/features/automations.md"],
    ],
    protectedPhrases: [
      "force-terminate routine",
      "routine approval",
      "routine work",
      "discovery routine",
      // Search keyword kept so people who remember the old name still find it.
      '"routine",',
      // The taxonomy records that the old word is retired.
      'word "routine" is retired',
    ],
    replacements: [
      [/\ba(\s+)routine\b/g, "an$1automation"],
      [/\bA(\s+)routine\b/g, "An$1automation"],
      [/\bA(\s+)Routine\b/g, "An$1Automation"],
      [/ROUTINE/g, "AUTOMATION"],
      [/Routine/g, "Automation"],
      [/routine(?!ly)/g, "automation"],
    ],
  },
  "wake-ups": {
    description: "Task heartbeat → Wake-up",
    fileRenames: [
      ["src/lib/automation/task-supervisor.ts", "src/lib/supervision/wake-up-policy.ts"],
      ["electron/host-service/task-supervisor-runtime.ts", "electron/host-service/wake-up-runtime.ts"],
      ["electron/main/task-supervisor-service.ts", "electron/main/wake-up-service.ts"],
      ["electron/persistence/task-heartbeat-store.ts", "electron/persistence/wake-up-store.ts"],
      ["tests/task-supervisor.test.ts", "tests/wake-up-policy.test.ts"],
      ["tests/task-supervisor-runtime.test.ts", "tests/wake-up-runtime.test.ts"],
      ["docs/features/task-heartbeats.md", "docs/features/wake-ups.md"],
    ],
    protectedPhrases: [
      // Provider and advisor progress ticks keep their own name.
      "progress heartbeat",
      // The taxonomy records that the old word is retired.
      'word "heartbeat" is retired',
      'Crane "heartbeats"',
    ],
    replacements: [
      [/automation\/task-supervisor/g, "supervision/wake-up-policy"],
      [/task-supervisor-runtime/g, "wake-up-runtime"],
      [/task-supervisor-service/g, "wake-up-service"],
      [/task-supervisor\.invoke/g, "wake-up.invoke"],
      [/task-supervisor-safety/g, "wake-up-safety"],
      [/tests\/task-supervisor\.test/g, "tests/wake-up-policy.test"],
      [/createTaskSupervisorRuntime/g, "createWakeUpRuntime"],
      [/TaskSupervisorRuntime/g, "WakeUpRuntime"],
      [/taskSupervisorRuntime/g, "wakeUpRuntime"],
      [/invokeTaskSupervisorAction/g, "invokeWakeUpAction"],
      [/invokeTaskSupervisor/g, "invokeWakeUp"],
      [/HostTaskSupervisorAction/g, "HostWakeUpAction"],
      [/TaskSupervisorPersistence/g, "WakeUpPersistence"],
      [/TASK_SUPERVISOR_TICK_INTERVAL_MS/g, "WAKE_UP_TICK_INTERVAL_MS"],
      [/TaskHeartbeat/g, "WakeUp"],
      [/taskHeartbeat/g, "wakeUp"],
      [/TASK_HEARTBEAT/g, "WAKE_UP"],
      [/task_heartbeat/g, "wake_up"],
      [/task-heartbeat/g, "wake-up"],
      [/heartbeat_id/g, "wake_up_id"],
    ],
    scoped: {
      files: [
        "config/reliability-gates.json",
        "docs/architecture/agent-platform-taxonomy.md",
        "docs/architecture/contracts.md",
        "docs/architecture/index.md",
        "docs/features/wake-ups.md",
        "electron/host-service.ts",
        "electron/host-service/local-mcp-runtime.ts",
        "electron/host-service/protocol.ts",
        "electron/host-service/wake-up-runtime.ts",
        "electron/main/host-service-request-timeouts.ts",
        "electron/main/stave-mcp-server-instructions.ts",
        "electron/main/stave-mcp-server.ts",
        "electron/main/wake-up-service.ts",
        "electron/persistence/sqlite-store.ts",
        "electron/persistence/wake-up-store.ts",
        "electron/providers/stave-local-mcp-approval.ts",
        "src/lib/supervision/wake-up-policy.ts",
        "src/lib/tool-display-name.ts",
        "tests/agent-platform-boundaries.test.ts",
        "tests/wake-up-runtime.test.ts",
        "tests/wake-up-policy.test.ts",
      ],
      identifierRules: [
        [/runHeartbeatTurn/g, "runSupervisedTurn"],
        [/HeartbeatWakeFailed/g, "WakeUpFailed"],
        [/InterruptedHeartbeatWakes/g, "InterruptedWakeUps"],
        [/HEARTBEAT/g, "WAKE_UP"],
        [/Heartbeat/g, "WakeUp"],
        [/heartbeat/g, "wakeUp"],
      ],
      proseRules: [
        [/\bTask Heartbeats\b/g, "Wake-ups"],
        [/\bTask heartbeats\b/g, "Wake-ups"],
        [/\btask heartbeats\b/g, "wake-ups"],
        [/\bTask Heartbeat\b/g, "Wake-up"],
        [/\bTask heartbeat\b/g, "Wake-up"],
        [/\btask heartbeat\b/g, "wake-up"],
        [/\bHeartbeats\b/g, "Wake-ups"],
        [/\bheartbeats\b/g, "wake-ups"],
        [/\bHeartbeat\b/g, "Wake-up"],
        [/\bheartbeat\b/g, "wake-up"],
        [/\bTask supervisor\b/g, "Supervisor"],
        [/\btask supervisor\b/g, "supervisor"],
      ],
    },
  },
  "delegated-tasks": {
    description: "Child task → Delegated task",
    fileRenames: [
      ["src/lib/runs/child-task.ts", "src/lib/runs/delegated-task.ts"],
      ["src/lib/runs/child-task-runtime.ts", "src/lib/runs/delegated-task-runtime.ts"],
      ["src/lib/runs/child-task-view.ts", "src/lib/runs/delegated-task-view.ts"],
      ["electron/main/runs/child-task-coordinator.ts", "electron/main/runs/delegated-task-coordinator.ts"],
      [
        "electron/main/runs/child-task-coordinator-instance.ts",
        "electron/main/runs/delegated-task-coordinator-instance.ts",
      ],
      ["electron/main/runs/child-task-host-port.ts", "electron/main/runs/delegated-task-host-port.ts"],
      ["src/components/session/ChildTaskRows.tsx", "src/components/session/DelegatedTaskRows.tsx"],
      ["src/components/session/child-task-rows.styles.ts", "src/components/session/delegated-task-rows.styles.ts"],
      ["src/components/session/useChildTasks.ts", "src/components/session/useDelegatedTasks.ts"],
      ["src/lib/task-context/child-task-receipts.ts", "src/lib/task-context/delegated-task-receipts.ts"],
      ["tests/child-task-rows.test.tsx", "tests/delegated-task-rows.test.tsx"],
      ["tests/child-task-coordinator.test.ts", "tests/delegated-task-coordinator.test.ts"],
      ["tests/child-task-fleet-attention.test.ts", "tests/delegated-task-fleet-attention.test.ts"],
      ["tests/child-task-host-port.test.ts", "tests/delegated-task-host-port.test.ts"],
      ["tests/child-task-identity-validation.test.ts", "tests/delegated-task-identity-validation.test.ts"],
      ["tests/child-task-ipc-contract.test.ts", "tests/delegated-task-ipc-contract.test.ts"],
      ["tests/child-task-ledger.test.ts", "tests/delegated-task-ledger.test.ts"],
      ["tests/child-task-receipts.test.ts", "tests/delegated-task-receipts.test.ts"],
      ["tests/child-task-runtime.test.ts", "tests/delegated-task-runtime.test.ts"],
      ["tests/child-task-view.test.ts", "tests/delegated-task-view.test.ts"],
      ["tests/child-task-workspace-listing.test.ts", "tests/delegated-task-workspace-listing.test.ts"],
      ["docs/features/child-tasks.md", "docs/features/delegated-tasks.md"],
    ],
    protectedPhrases: [
      // Persisted identity: a run id is `child-task:<parent>:<key>` for rows
      // written before and after the rename, so one delegation key keeps
      // naming one run. Never rewrite the format.
      'RUN_ID_PREFIX = "child-task"',
      '"child-task:',
      "`child-task:${args",
      "`child-task:task-",
      "`child-task:<parentTaskId>",
      'words "child task" are retired',
      // Settings search alias so people who remember the old name still find it.
      '"child task",',
      "persisted `child-task:<parent>:<key>`",
    ],
    replacements: [
      [/runs:delegate-child-task/g, "delegations:create"],
      [/runs:list-child-tasks/g, "delegations:list"],
      [/runs:follow-up-child-task/g, "delegations:follow-up"],
      [/runs:retry-child-task/g, "delegations:retry"],
      [/runs:stop-child-task/g, "delegations:stop"],
      [/runs:get-child-task-link/g, "delegations:get-link"],
      [/runs:detach-child-task/g, "delegations:detach"],
      [/runs:child-tasks-changed/g, "delegations:changed"],
      [/isDelegatedChildTask/g, "isDelegatedTask"],
      [/delegateChildTask/g, "delegateTask"],
      [/ChildTaskDelegateArgs/g, "DelegateTaskArgs"],
      [/childWorkspaceId/g, "delegatedWorkspaceId"],
      [/childTurnId/g, "delegatedTurnId"],
      [/CHILD_TASK/g, "DELEGATED_TASK"],
      [/ChildTask/g, "DelegatedTask"],
      [/childTask/g, "delegatedTask"],
      [/child_task/g, "delegated_task"],
      [/child-task/g, "delegated-task"],
      [/Child-task/g, "Delegated-task"],
      [/\bChild Tasks\b/g, "Delegated Tasks"],
      [/\bChild tasks\b/g, "Delegated tasks"],
      [/\bchild tasks\b/g, "delegated tasks"],
      [/\bChild Task\b/g, "Delegated Task"],
      [/\bChild task\b/g, "Delegated task"],
      [/\bchild task\b/g, "delegated task"],
    ],
  },
  issues: {
    description: "Tracker task → Tracker issue (the Tasks surface becomes Issues)",
    fileRenames: [],
    pathRenames: [
      [/^src\/lib\/tracker-tasks\//, "src/lib/tracker-issues/"],
      [/^electron\/main\/tracker-tasks\//, "electron/main/tracker-issues/"],
      [/^src\/components\/layout\/tasks\//, "src/components/layout/issues/"],
      [/tracker-tasks/g, "tracker-issues"],
      [/tracker-task/g, "tracker-issue"],
      [/TrackerTasks/g, "TrackerIssues"],
      [/TrackerTask/g, "TrackerIssue"],
      [/\/Tasks(Board|PeekPanel|SurfaceHeader|Toolbar|View)\.tsx$/, "/Issues$1.tsx"],
      [/\/tasks-(layout|row)\./, "/issues-$1."],
      [/TopBarTasks/, "TopBarIssues"],
      [/settings-dialog-tasks-section/, "settings-dialog-issues-section"],
      [/^docs\/features\/tasks\.md$/, "docs/features/issues.md"],
      [/^tests\/e2e\/tasks-design-system/, "tests/e2e/issues-design-system"],
    ],
    // A dated cross-repository record keeps the name the other repository links to.
    keepPaths: ["docs/superpowers/plans/2026-09-03-tracker-tasks-atelier.md"],
    protectedPhrases: [
      "2026-09-03-tracker-tasks-atelier",
      // Crane's own vocabulary and wire contract stay as Crane names them.
      "crane-tasks",
    ],
    replacements: [
      [/layout\/tasks\//g, "layout/issues/"],
      [/"\.\/tasks\//g, '"./issues/'],
      [/\/Tasks(Board|PeekPanel|SurfaceHeader|Toolbar|View)\b/g, "/Issues$1"],
      [/\/tasks-(layout|row)\./g, "/issues-$1."],
      [/TopBarTasks/g, "TopBarIssues"],
      [/settings-dialog-tasks-section/g, "settings-dialog-issues-section"],
      [/TrackerTasksSettingsSection/g, "IssueTrackerSettingsSection"],
      [/features\/tasks\.md/g, "features/issues.md"],
      [/\(tasks\.md\)/g, "(issues.md)"],
      [/e2e\/tasks-design-system/g, "e2e/issues-design-system"],
      [/\bTasks Guide\b/g, "Issues Guide"],
      [/\bTasks surface\b/g, "Issues surface"],
      [/TRACKER_TASKS/g, "TRACKER_ISSUES"],
      [/TRACKER_TASK/g, "TRACKER_ISSUE"],
      [/TrackerTasks/g, "TrackerIssues"],
      [/TrackerTask/g, "TrackerIssue"],
      [/trackerTasks/g, "trackerIssues"],
      [/trackerTask/g, "trackerIssue"],
      [/tracker_tasks/g, "tracker_issues"],
      [/tracker_task/g, "tracker_issue"],
      [/tracker-tasks/g, "tracker-issues"],
      [/tracker-task/g, "tracker-issue"],
      [/\bTracker tasks\b/g, "Tracker issues"],
      [/\btracker tasks\b/g, "tracker issues"],
      [/\bTracker task\b/g, "Tracker issue"],
      [/\btracker task\b/g, "tracker issue"],
    ],
    scoped: {
      files: [
        "src/store/app-surface.ts",
        "src/components/layout/AppShell.tsx",
        "src/components/layout/TopBar.tsx",
        "src/components/layout/TopBarIssues.tsx",
        "src/components/layout/command-palette-registry.ts",
        "src/components/layout/KeyboardShortcutsDrawer.tsx",
        "src/components/layout/settings-dialog.registry.ts",
        "src/components/layout/settings-dialog.schema.ts",
        "src/components/layout/settings-dialog-sections.tsx",
        "src/components/layout/settings-dialog-issues-section.tsx",
        "src/lib/app-shortcuts.ts",
        "src/components/layout/issues/IssuesBoard.tsx",
        "src/components/layout/issues/IssuesPeekPanel.tsx",
        "src/components/layout/issues/IssuesSurfaceHeader.tsx",
        "src/components/layout/issues/IssuesToolbar.tsx",
        "src/components/layout/issues/IssuesView.tsx",
        "src/dev/ads-regression-preview/index.tsx",
        "tests/app-shortcuts.test.ts",
        "tests/command-palette.test.ts",
        "tests/tracker-issues-board-view.test.tsx",
        "tests/tracker-issues-peek-panel.test.tsx",
        "tests/e2e/issues-design-system.e2e.ts",
      ],
      identifierRules: [
        [/TasksView/g, "IssuesView"],
        [/TasksBoard/g, "IssuesBoard"],
        [/TasksToolbar/g, "IssuesToolbar"],
        [/TasksSurfaceHeader/g, "IssuesSurfaceHeader"],
        [/TasksPeekPanel/g, "IssuesPeekPanel"],
        [/TasksPeekDock/g, "IssuesPeekDock"],
        [/openTasks/g, "openIssues"],
        [/closeTasks/g, "closeIssues"],
        [/toggleTasks/g, "toggleIssues"],
        [/TASKS_APP_SURFACE/g, "ISSUES_APP_SURFACE"],
        [/showTasks/g, "showIssues"],
        [/isTasksActive/g, "isIssuesActive"],
      ],
      proseRules: [
        [/\bOpen Tasks\b/g, "Open Issues"],
        [/\bRefresh Tasks\b/g, "Refresh Issues"],
        [/\bnavigation\.tasks\b/g, "navigation.issues"],
        [/\btracker\.refresh-tasks\b/g, "tracker.refresh-issues"],
        [/Settings → Tasks/g, "Settings → Issues"],
        [/^(\s*)Tasks(\s*)$/g, "$1Issues$2"],
      ],
    },
  },
};

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout;
}

function withProtectedPhrases(
  source: string,
  phrases: readonly string[],
  transform: (text: string) => string,
) {
  const placeholders = phrases.map((_, index) => `\u0000PROTECTED_${index}\u0000`);
  let text = source;
  phrases.forEach((phrase, index) => {
    text = text.split(phrase).join(placeholders[index]);
  });
  text = transform(text);
  phrases.forEach((phrase, index) => {
    text = text.split(placeholders[index]).join(phrase);
  });
  return text;
}

function applyReplacements(text: string, replacements: readonly Replacement[]) {
  let next = text;
  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function applyRules(source: string, rules: RuleSet) {
  return withProtectedPhrases(source, rules.protectedPhrases, (text) =>
    applyReplacements(text, rules.replacements),
  );
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Identifiers get code casing; comments, strings and JSX text get prose. */
function applyScopedToScript(file: string, source: string, rules: RuleSet) {
  const scoped = rules.scoped!;
  const kind = file.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : /\.(?:js|mjs|cjs)$/.test(file)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const edits: Edit[] = [];
  const prose = (start: number, end: number) => {
    const original = source.slice(start, end);
    const next = withProtectedPhrases(original, rules.protectedPhrases, (text) =>
      applyReplacements(text, scoped.proseRules),
    );
    if (next !== original) edits.push({ start, end, text: next });
  };
  const seenComments = new Set<number>();
  const comments = (ranges: ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      if (seenComments.has(range.pos)) continue;
      seenComments.add(range.pos);
      prose(range.pos, range.end);
    }
  };
  const visit = (node: ts.Node) => {
    comments(ts.getLeadingCommentRanges(source, node.pos));
    comments(ts.getTrailingCommentRanges(source, node.end));
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      const start = node.getStart(sourceFile);
      const original = source.slice(start, node.end);
      const next = applyReplacements(original, scoped.identifierRules);
      if (next !== original) edits.push({ start, end: node.end, text: next });
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      prose(node.getStart(sourceFile) + 1, node.end - 1);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
      prose(node.getStart(sourceFile) + 1, node.end - 2);
    } else if (ts.isTemplateTail(node)) {
      prose(node.getStart(sourceFile) + 1, node.end - 1);
    } else if (ts.isJsxText(node)) {
      prose(node.getStart(sourceFile), node.end);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  comments(ts.getLeadingCommentRanges(source, sourceFile.endOfFileToken.pos));
  edits.sort((left, right) => right.start - left.start);
  let text = source;
  for (const edit of edits) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return text;
}

function applyScoped(file: string, source: string, rules: RuleSet) {
  if (!rules.scoped?.files.includes(file)) return source;
  if (SCRIPT_FILE.test(file)) return applyScopedToScript(file, source, rules);
  return withProtectedPhrases(source, rules.protectedPhrases, (text) =>
    applyReplacements(text, rules.scoped!.proseRules),
  );
}

/**
 * Reports identifiers that a rename would merge. Per script file, every
 * identifier is renamed as the run would rename it; a collision is two
 * different names becoming one, or a name becoming one that already exists
 * in the file (for example a local helper wrapping the import it would now
 * shadow). Every hit must be resolved by hand, because the merged file often
 * still type-checks.
 */
function reportCollisions(
  files: string[],
  rules: RuleSet,
  scopePathOf: (file: string) => string,
) {
  let count = 0;
  for (const file of files) {
    if (!SCRIPT_FILE.test(file)) continue;
    // Marked migration blocks hold legacy names on purpose.
    const source = readFileSync(file, "utf8").replace(MARKED_BLOCK, "");
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const identifiers = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) identifiers.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    const inScope = rules.scoped?.files.includes(scopePathOf(file)) ?? false;
    const originalsByRenamed = new Map<string, Set<string>>();
    for (const identifier of identifiers) {
      const global = applyRules(identifier, rules);
      const renamed = inScope
        ? applyReplacements(global, rules.scoped!.identifierRules)
        : global;
      const originals = originalsByRenamed.get(renamed) ?? new Set<string>();
      originals.add(identifier);
      originalsByRenamed.set(renamed, originals);
    }
    for (const [renamed, originals] of originalsByRenamed) {
      if (originals.size < 2) continue;
      count += 1;
      console.warn(`collision: ${file}: ${[...originals].join(" + ")} -> ${renamed}`);
    }
  }
  return count;
}

function main() {
  const [ruleSetName, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  const rules = ruleSetName ? RULE_SETS[ruleSetName] : undefined;
  if (!rules) {
    console.error(
      `Usage: bun scripts/codemods/rename-vocabulary.ts <${Object.keys(RULE_SETS).join("|")}> [--dry-run]`,
    );
    process.exit(2);
  }

  const renamedPath = new Map<string, string>();
  const plannedRenames: Array<readonly [string, string]> = [...rules.fileRenames];
  if (rules.pathRenames?.length) {
    for (const file of run("git", ["ls-files"]).split("\n")) {
      if (!file || rules.keepPaths?.includes(file)) continue;
      const next = applyReplacements(file, rules.pathRenames);
      if (next !== file) plannedRenames.push([file, next]);
    }
  }
  for (const [from, to] of plannedRenames) {
    if (!existsSync(from)) continue;
    if (existsSync(to)) throw new Error(`Refusing to overwrite ${to}`);
    console.log(`${dryRun ? "would move" : "move"} ${from} -> ${to}`);
    renamedPath.set(from, to);
    if (!dryRun) {
      mkdirSync(path.dirname(to), { recursive: true });
      run("git", ["mv", from, to]);
    }
  }

  const migrationTests = registeredMigrationTests();
  const files = run("git", ["ls-files"])
    .split("\n")
    .filter(
      (file) =>
        file &&
        TEXT_FILE.test(file) &&
        !ALWAYS_EXCLUDED.some((pattern) => pattern.test(file)) &&
        !migrationTests.has(file) &&
        existsSync(file),
    );
  const collisions = reportCollisions(files, rules, (file) => renamedPath.get(file) ?? file);
  let changed = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // In a dry run the file has not moved, so scope lookups use its new path.
    const scopePath = renamedPath.get(file) ?? file;
    const next = withMarkedBlocksProtected(source, (text) =>
      applyScoped(scopePath, applyRules(text, rules), rules),
    );
    if (next === source) continue;
    changed += 1;
    console.log(`${dryRun ? "would rewrite" : "rewrite"} ${file}`);
    if (!dryRun) writeFileSync(file, next);
  }
  console.log(
    `${rules.description}: ${changed} file(s) ${dryRun ? "would change" : "changed"}; ${collisions} collision(s) to review.`,
  );
}

main();
