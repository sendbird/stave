import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { RightRailPanelShell } from "@/components/layout/RightRailPanelShell";
import { TaskPanel } from "@/components/session/TaskPanel";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import type { MissionDetail } from "@/lib/missions/api";
import {
  createMission,
  listExternalEffectStages,
  type MissionStageRecord,
} from "@/lib/missions/domain";
import { createWorkflowFromStarter, findWorkflowStarter } from "@/dev/fixtures/legacy-workflow-starters";
import type { WorkspacePrInfo } from "@/lib/pr-status";
import { isTaskPanelTab, type TaskPanelTab } from "@/lib/right-rail-panels";
import type { ResultReview } from "@/lib/reviews/result-review";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";
import {
  providerAgentNodeKey,
  type AgentNode,
  type WorkGraph,
} from "@/lib/work-graph/work-graph.types";
import type { TaskAgent } from "@/store/agent-assignments-store";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useMissionsStore, missionTaskKey } from "@/store/missions-store";
import { useWakeUpsStore, wakeUpTaskKey } from "@/store/wake-ups-store";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

/**
 * The Task panel on the dev preview (`?stavePreview=task-panel`), in a frame
 * the width of the right rail, with the stores seeded and no IPC.
 *
 * - `task=plain` (default): a direct task with a plan, changed files, a passing
 *   verification, an open pull request and one run waiting for review, whose
 *   saved answer, files and turn (tool calls included) Results renders.
 * - `task=mission`: a mission task run by an agent, with a live turn, a running
 *   subagent, a finished delegated review and a scheduled wake-up.
 * - `tab=activity|progress|team|results` picks the tab the panel opens on.
 * - `panelWidth=320|384` sets the frame width (default 320).
 * - `pending=approval|user_input` makes the live turn wait on the user.
 * - `placement=docked` keeps the activity list in the composer shelf, so the
 *   Activity tab shows its move-here notice instead of the list.
 * - `theme=dark` or `theme=<built-in theme id>` renders under that theme.
 */
const params = new URLSearchParams(window.location.search);

const WORKSPACE_ID = "task-panel-preview-ws";
const REPOSITORY_PATH = "/tmp/task-panel-preview-repo";
const PLAIN_TASK_ID = "task-panel-preview-plain";
const MISSION_TASK_ID = "task-panel-preview-mission";
const RESULT_REVIEW_STORAGE_KEY = "stave:result-reviews:v1";

/** The latest run's final answer: a list, a fenced block wider than the panel, and enough lines to collapse. */
const PLAIN_ANSWER = [
  "Tightened the settings sidebar and kept the keyboard order.",
  "",
  "**What changed**",
  "",
  "- Row gap is now `8px` (was `12px`) and the list padding `12px`.",
  "- Rows center their icons, so the focus ring no longer clips.",
  "- Tab order still follows the visual order; nothing was re-parented.",
  "",
  "```ts",
  "export const sidebarStyles = stylex.create({",
  '  list: { gap: vars["--ads-space-8"], padding: vars["--ads-space-12"] },',
  '  row: { alignItems: "center", minBlockSize: 32, paddingInline: vars["--ads-space-12"], borderRadius: vars["--ads-radius-control"] },',
  "});",
  "```",
  "",
  "**Checks**",
  "",
  "1. `bun run typecheck` passes.",
  "2. `bun test tests/settings-sidebar.test.tsx` passes (12 tests).",
  "3. Tab and Shift+Tab walk the rows top to bottom.",
  "",
  "Left alone: the section headers keep their spacing; changing them is a separate pass.",
].join("\n");

const SIDEBAR_DIFF = {
  filePath: "src/components/settings/Sidebar.tsx",
  oldContent: "<nav className={sx(styles.list)}>\n  {rows}\n</nav>\n",
  newContent: "<nav className={sx(styles.list)} aria-label=\"Settings\">\n  {rows}\n</nav>\n",
};
const STYLES_DIFF = {
  filePath: "src/components/settings/sidebar.styles.ts",
  oldContent: "  list: { gap: 12, padding: 16 },\n  row: { minBlockSize: 32 },\n",
  newContent: '  list: { gap: vars["--ads-space-8"], padding: vars["--ads-space-12"] },\n  row: { alignItems: "center", minBlockSize: 32 },\n',
};

const PLAIN_MESSAGES: ChatMessage[] = [
  {
    id: "u0",
    role: "user",
    model: "",
    providerId: "user",
    content: "Look at the settings sidebar spacing and propose a change.",
    startedAt: "2026-09-29T08:30:00.000Z",
    parts: [],
  },
  {
    id: "a0",
    role: "assistant",
    model: "claude-sonnet-5",
    providerId: "claude-code",
    content: "",
    turnId: "turn-plain-0",
    startedAt: "2026-09-29T08:30:05.000Z",
    completedAt: "2026-09-29T08:40:00.000Z",
    terminalStopReason: "end_turn",
    parts: [
      {
        type: "tool_use",
        toolUseId: "tool-read-0",
        toolName: "Read",
        state: "output-available",
        input: JSON.stringify({ file_path: "src/components/settings/sidebar.styles.ts" }),
        output: "  list: { gap: 12, padding: 16 },",
      },
      { type: "text", text: "The rows use a 12px gap and 16px padding. I propose 8px and 12px, with centered icons." },
    ],
  } as unknown as ChatMessage,
  {
    id: "u1",
    role: "user",
    model: "",
    providerId: "user",
    content: "Tighten the spacing of the settings sidebar and keep the keyboard order.",
    startedAt: "2026-09-29T09:00:00.000Z",
    parts: [],
  },
  {
    id: "a1",
    role: "assistant",
    model: "claude-sonnet-5",
    providerId: "claude-code",
    content: "",
    turnId: "turn-plain-1",
    startedAt: "2026-09-29T09:00:05.000Z",
    completedAt: "2026-09-29T09:03:00.000Z",
    terminalStopReason: "end_turn",
    parts: [
      {
        type: "tool_use",
        toolUseId: "tool-read-1",
        toolName: "Read",
        state: "output-available",
        input: JSON.stringify({ file_path: "src/components/settings/Sidebar.tsx" }),
        output: "<nav className={sx(styles.list)}>",
      },
      {
        type: "tool_use",
        toolName: "TodoWrite",
        state: "output-available",
        input: JSON.stringify({
          todos: [
            { content: "Read the sidebar layout", status: "completed" },
            { content: "Tighten the row gaps", status: "completed" },
            { content: "Verify keyboard order", status: "completed" },
          ],
        }),
      },
      { type: "code_diff", ...SIDEBAR_DIFF, status: "accepted" },
      { type: "code_diff", ...STYLES_DIFF, status: "accepted" },
      {
        type: "tool_use",
        toolUseId: "tool-bash-1",
        toolName: "Bash",
        state: "output-available",
        input: JSON.stringify({ command: "bun run typecheck && bun test tests/settings-sidebar.test.tsx" }),
        output: "12 pass\n0 fail",
        exitCode: 0,
      },
      { type: "text", text: PLAIN_ANSWER },
    ],
  } as unknown as ChatMessage,
];

const PLAIN_PR_INFO: WorkspacePrInfo = {
  pr: {
    number: 128,
    title: "Tighten settings sidebar spacing",
    state: "OPEN",
    isDraft: false,
    url: "https://example.test/128",
    reviewDecision: "REVIEW_REQUIRED",
    mergeable: "MERGEABLE",
    mergeStateStatus: "BLOCKED",
    checksRollup: "SUCCESS",
    mergedAt: null,
    baseRefName: "main",
    headRefName: "feat/sidebar-spacing",
  },
  derived: "review_required",
  lastFetched: Date.parse("2026-09-29T09:04:00.000Z"),
};

const PLAIN_RESULTS: ResultReview[] = [
  {
    id: "task-panel-preview-result-1",
    repositoryPath: REPOSITORY_PATH,
    repositoryName: "preview-repo",
    workspaceId: WORKSPACE_ID,
    workspaceName: "sidebar-spacing",
    taskId: PLAIN_TASK_ID,
    taskTitle: "Tighten settings sidebar spacing",
    turnId: "turn-plain-1",
    outcome: "completed",
    summary: "Tightened the row gaps to 8px and kept the keyboard order; typecheck and the focused tests pass.",
    createdAt: "2026-09-29T09:03:00.000Z",
    reviewedAt: null,
    evidence: {
      messageId: "a1",
      providerId: "claude-code",
      model: "claude-sonnet-5",
      modelInfo: { effort: "medium" },
      answer: PLAIN_ANSWER,
      answerTruncated: false,
      files: [SIDEBAR_DIFF.filePath, STYLES_DIFF.filePath, "src/components/settings/SidebarRow.tsx"],
      filesTruncated: false,
      snapshots: [
        { ...SIDEBAR_DIFF, status: "accepted", truncated: false },
        { ...STYLES_DIFF, status: "accepted", truncated: false },
      ],
      snapshotsTruncated: false,
    },
  },
  {
    id: "task-panel-preview-result-0",
    repositoryPath: REPOSITORY_PATH,
    repositoryName: "preview-repo",
    workspaceId: WORKSPACE_ID,
    workspaceName: "sidebar-spacing",
    taskId: PLAIN_TASK_ID,
    taskTitle: "Tighten settings sidebar spacing",
    turnId: "turn-plain-0",
    outcome: "completed",
    summary: "Read the sidebar layout and proposed the spacing change.",
    createdAt: "2026-09-29T08:40:00.000Z",
    reviewedAt: "2026-09-29T08:50:00.000Z",
    evidence: {
      messageId: "a0",
      providerId: "claude-code",
      model: "claude-sonnet-5",
      answer: "The rows use a 12px gap and 16px padding. I propose 8px and 12px, with centered icons.",
      answerTruncated: false,
      files: [],
      filesTruncated: false,
      snapshots: [],
    },
  },
];

const MISSION_MESSAGES: ChatMessage[] = [
  {
    id: "mu1",
    role: "user",
    model: "",
    providerId: "user",
    content: "Add pagination to the /users API endpoint and open a PR.",
    startedAt: "2026-09-29T10:00:00.000Z",
    parts: [],
  },
  {
    id: "ma1",
    role: "assistant",
    model: "claude-sonnet-5",
    providerId: "claude-code",
    content: "",
    turnId: "turn-task-panel-1",
    startedAt: "2026-09-29T10:06:00.000Z",
    parts: [
      {
        type: "code_diff",
        filePath: "server/users.ts",
        oldContent: "return all(users);\n",
        newContent: "return page(users, limit, offset);\n",
        status: "accepted",
      },
    ],
  } as unknown as ChatMessage,
];

const MISSION_AGENT: TaskAgent = {
  assignmentId: "assignment-task-panel-1",
  agentConfigId: "implementer",
  agentName: "Implementer",
  agentContentHash: "preview",
  received: [{ sourceId: "implementer", kind: "agent", hash: "preview", included: true }],
  support: [
    { field: "instructions", level: "enforced" },
    { field: "permission", level: "enforced" },
  ],
  state: "started",
  providerId: "claude-code",
  model: "claude-sonnet-5",
  workspaceMode: "new-worktree",
  branch: "agent/implementer-users-pagination",
  detail: null,
  createdAt: "2026-09-29T10:00:00.000Z",
  updatedAt: "2026-09-29T10:00:20.000Z",
} as unknown as TaskAgent;

const MISSION_START = new Date(Date.now() - 22 * 60_000);
const at = (minutes: number) => new Date(MISSION_START.getTime() + minutes * 60_000).toISOString();

/** A real mission from the request-to-PR starter, two stages in, so every surface reads it. */
function missionDetail(): MissionDetail {
  const workflow = createWorkflowFromStarter(findWorkflowStarter("request-to-pr")!, {
    now: MISSION_START,
    id: "workflow_task_panel_preview",
  });
  const created = createMission({
    id: "mission-task-panel-1",
    input: {
      workspaceId: WORKSPACE_ID,
      leadTaskId: MISSION_TASK_ID,
      workflow,
      assignment: "Add pagination to the /users API endpoint and open a PR.",
      consent: {
        checkIns: "plan-and-publishing",
        permissionMode: "guided",
        authorizedEffectStageIds: listExternalEffectStages(workflow).map((stage) => stage.id),
      },
    },
    repositoryPath: REPOSITORY_PATH,
    fingerprint: { providerId: "claude-code", model: "sonnet" },
    now: MISSION_START,
  });
  const record = (stageId: string, patch: Partial<MissionStageRecord>): MissionStageRecord => ({
    ...created.upserts[0]!,
    stageId,
    ...patch,
  });
  const [first, second] = workflow.stages;
  return {
    mission: { ...created.mission, currentStageIndex: 1, turnCount: 3 },
    stages: [
      record(first!.id, {
        status: "completed",
        startedAt: at(0),
        endedAt: at(3),
        reportRevision: 1,
        report: {
          outcome: "complete",
          summary: "Planned the pagination change: a limit and offset pair on the users router.",
          decisions: [{ decision: "Offset pagination", reason: "The client already sends page numbers." }],
          evidence: [{ label: "Typecheck", kind: "check", command: "bun run typecheck" }],
          artifacts: [],
          acceptanceCriteria: [
            { text: "/users accepts limit and offset", status: "met" },
            { text: "The default page size is documented", status: "unverified" },
          ],
          reportedAt: at(3),
          turnId: "turn-1",
        },
      }),
      record(second!.id, { status: "running", startedAt: at(4) }),
    ],
    events: [],
    report: null,
  };
}

/** A live turn with one running subagent, so Activity has rows and Team has a count. */
function liveTurnActivity(now: number, pending: string | null) {
  const turnId = "turn-task-panel-1";
  const graph = createWorkGraph({ turnId, providerId: "claude-code", startedAt: now - 95_000 });
  const explorerKey = providerAgentNodeKey("claude-code", "explore-1");
  const explorer: AgentNode = {
    key: explorerKey,
    identitySource: "provider",
    agentId: "explore-1",
    parentKey: graph.rootKey,
    label: "Explore the users router",
    badge: "Explore",
    status: "running",
    startedAt: now - 40_000,
    updatedAt: now,
    progress: ["Reading server/users.ts"],
  };
  const workGraph: WorkGraph = {
    ...graph,
    updatedAt: now,
    nodesByKey: { ...graph.nodesByKey, [explorerKey]: explorer },
    orderedNodeKeys: [...graph.orderedNodeKeys, explorerKey],
  };
  const item = (
    id: string,
    status: "completed" | "running",
    title: string,
    detail: string,
    toolName: string,
    startedAgo: number,
  ) => ({
    id,
    kind: "tool" as const,
    status,
    title,
    detail,
    toolName,
    toolUseId: id,
    progressMessages: [],
    startedAt: now - startedAgo,
    updatedAt: status === "running" ? now : now - startedAgo + 1_500,
    elapsedSeconds: status === "running" ? Math.round(startedAgo / 1000) : 1,
  });
  return {
    turnId,
    providerId: "claude-code" as const,
    startedAt: now - 95_000,
    lastEventAt: now,
    stalledAt: null,
    pendingInteraction: pending === "approval" || pending === "user_input" ? pending : null,
    workGraph,
    workItemsById: {
      "tool-1": item("tool-1", "completed", "Read file", "server/users.ts", "Read", 90_000),
      "tool-2": item("tool-2", "completed", "Edit file", "server/users.ts", "Edit", 60_000),
      "tool-3": item("tool-3", "running", "Run command", "bun test tests/users", "Bash", 12_000),
    },
    orderedWorkItemIds: ["tool-1", "tool-2", "tool-3"],
  };
}

/** A finished delegated review with a Markdown answer, for the Subagents tab. */
const DELEGATED_REVIEW: DelegatedTaskSummary = {
  runId: "child-task:mission:review",
  stepId: "child-task:mission:review:turn",
  parentTaskId: MISSION_TASK_ID,
  delegationKey: "review-users-pagination",
  delegatedTaskId: "task-panel-preview-review",
  delegatedWorkspaceId: WORKSPACE_ID,
  delegatedTurnId: "turn-review-1",
  providerId: "codex",
  requestedModel: "gpt-5.5",
  lifecycle: "one-turn",
  phase: "completed",
  reason: null,
  attempt: 0,
  createdAt: "2026-09-29T10:02:00.000Z",
  updatedAt: "2026-09-29T10:05:00.000Z",
  completedAt: "2026-09-29T10:05:00.000Z",
  result: [
    "Reviewed the pagination change. **Approve with one fix.**",
    "",
    "- `limit` is clamped to 1–100; good.",
    "- `offset` is not validated: a negative value reaches the query.",
    "",
    "```ts",
    "const offset = Math.max(0, Number(req.query.offset ?? 0));",
    "```",
  ].join("\n"),
};

/**
 * The browser dev bridge has no delegation ledger; list the delegated review
 * the way the desktop bridge would. Left alone when a real ledger exists.
 */
function stubDelegatedTasks() {
  const host = window as unknown as {
    api?: Record<string, unknown> & { runs?: Record<string, unknown> };
  };
  if (host.api?.runs?.listDelegatedTasks) return;
  host.api = {
    ...host.api,
    runs: {
      ...host.api?.runs,
      listDelegatedTasks: async (args: { parentTaskId: string }) =>
        args.parentTaskId === MISSION_TASK_ID ? [DELEGATED_REVIEW] : [],
    },
  };
}

function seedResultReviews() {
  let rows: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RESULT_REVIEW_STORAGE_KEY) ?? "[]");
    if (Array.isArray(parsed)) rows = parsed;
  } catch {
    rows = [];
  }
  const others = rows.filter(
    (row) => !(typeof row === "object" && row !== null && (row as { workspaceId?: unknown }).workspaceId === WORKSPACE_ID),
  );
  window.localStorage.setItem(RESULT_REVIEW_STORAGE_KEY, JSON.stringify([...others, ...PLAIN_RESULTS]));
}

function seedStores(args: { task: string; tab: TaskPanelTab; pending: string | null; placement: string | null }) {
  const now = Date.now();
  const activeTaskId = args.task === "mission" ? MISSION_TASK_ID : PLAIN_TASK_ID;
  const store = useAppStore.getState();
  seedResultReviews();
  stubDelegatedTasks();
  useAppStore.setState({
    repositoryPath: REPOSITORY_PATH,
    repositoryName: "preview-repo",
    defaultBranch: "main",
    activeWorkspaceId: WORKSPACE_ID,
    activeTaskId,
    workspacePathById: { [WORKSPACE_ID]: REPOSITORY_PATH },
    // Known files, so inline code in answers stays code unless it names one.
    repositoryFiles: [
      SIDEBAR_DIFF.filePath,
      STYLES_DIFF.filePath,
      "src/components/settings/SidebarRow.tsx",
      "server/users.ts",
    ],
    taskWorkspaceIdById: { [PLAIN_TASK_ID]: WORKSPACE_ID, [MISSION_TASK_ID]: WORKSPACE_ID },
    tasks: [
      {
        id: PLAIN_TASK_ID,
        title: "Tighten settings sidebar spacing",
        provider: "claude-code",
        updatedAt: "2026-09-29T09:04:00.000Z",
        unread: false,
        controlMode: "interactive",
        controlOwner: "stave",
      },
      {
        id: MISSION_TASK_ID,
        title: "Add pagination to /users",
        provider: "claude-code",
        updatedAt: "2026-09-29T10:06:00.000Z",
        unread: false,
        controlMode: "interactive",
        controlOwner: "stave",
      },
    ],
    messagesByTask: {
      [PLAIN_TASK_ID]: PLAIN_MESSAGES,
      [MISSION_TASK_ID]: MISSION_MESSAGES,
    },
    // The whole history is resident, so "Show the turn" reads it from here.
    messageCountByTask: {
      [PLAIN_TASK_ID]: PLAIN_MESSAGES.length,
      [MISSION_TASK_ID]: MISSION_MESSAGES.length,
    },
    activeTurnIdsByTask: { [MISSION_TASK_ID]: "turn-task-panel-1" },
    providerTurnActivityByTask: { [MISSION_TASK_ID]: liveTurnActivity(now, args.pending) },
    turnVerificationByWorkspace: {
      [WORKSPACE_ID]: {
        workspaceId: WORKSPACE_ID,
        taskId: PLAIN_TASK_ID,
        status: "pass",
        totalEntries: 3,
        executedEntries: 3,
        failures: [],
        completedAt: Date.parse("2026-09-29T09:03:30.000Z"),
      },
    },
    workspacePrInfoById: { [WORKSPACE_ID]: PLAIN_PR_INFO },
    layout: {
      ...store.layout,
      sidebarOverlayVisible: true,
      sidebarOverlayTab: "task",
      taskPanelTab: args.tab,
    },
    settings: {
      ...store.settings,
      turnActivityPlacement: args.placement === "docked" ? "docked" : "panel",
    },
  } as never);

  useAgentAssignmentsStore.setState({
    byTaskId: { [MISSION_TASK_ID]: MISSION_AGENT },
    loaded: true,
  });

  const detail = missionDetail();
  useMissionsStore.setState({
    workspaceId: WORKSPACE_ID,
    loadedWorkspaceId: WORKSPACE_ID,
    details: { [detail.mission.id]: detail },
    missionIdByTask: { [missionTaskKey(WORKSPACE_ID, MISSION_TASK_ID)]: detail.mission.id },
    missionIdsByTask: { [missionTaskKey(WORKSPACE_ID, MISSION_TASK_ID)]: [detail.mission.id] },
  } as never);

  useWakeUpsStore.setState({
    workspaceId: WORKSPACE_ID,
    byTask: {
      [wakeUpTaskKey(WORKSPACE_ID, MISSION_TASK_ID)]: {
        wakeUp: {
          id: "wake-task-panel",
          workspaceId: WORKSPACE_ID,
          taskId: MISSION_TASK_ID,
          trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
        },
        summary: {
          wakeUpId: "wake-task-panel",
          taskId: MISSION_TASK_ID,
          triggerKind: "schedule",
          state: "paused",
          reason: "A mission is running on this task. This wake-up resumes when the mission ends.",
          nextRunAt: null,
          occurrenceCount: 3,
          skippedCount: 1,
        },
      },
    },
  } as never);
}

export function TaskPanelPreview() {
  const theme = params.get("theme");
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === theme) ?? null;
  const task = params.get("task") === "mission" ? "mission" : "plain";
  const requestedTab = params.get("tab");
  const tab: TaskPanelTab = isTaskPanelTab(requestedTab) ? requestedTab : "activity";
  const requestedWidth = Number(params.get("panelWidth"));
  const panelWidth = Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : 320;
  const [seeded, setSeeded] = useState(false);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: theme === "dark" || builtinTheme?.baseMode === "dark" });
    applyCustomTheme({ theme: builtinTheme });
  }, [theme, builtinTheme]);
  useLayoutEffect(() => {
    seedStores({ task, tab, pending: params.get("pending"), placement: params.get("placement") });
    setSeeded(true);
  }, [task, tab]);
  return (
    <main className={sx(styles.page)}>
      <p className={sx(styles.caption)}>
        Task panel · {task === "mission" ? "mission task" : "direct task"} · {panelWidth}px
      </p>
      {seeded ? (
        <div className={sx(styles.frame)} style={{ width: panelWidth }} data-testid="task-panel-frame">
          <RightRailPanelShell panelId="task" ownHeader>
            <TaskPanel />
          </RightRailPanelShell>
        </div>
      ) : null}
    </main>
  );
}

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    height: "100vh",
    padding: vars["--ads-space-16"],
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
  },
  caption: {
    margin: 0,
    flex: "none",
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  frame: {
    flex: "1 1 auto",
    minHeight: 0,
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    overflow: "hidden",
  },
});
