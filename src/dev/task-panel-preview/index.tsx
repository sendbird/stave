import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { RightRailPanelShell } from "@/components/layout/RightRailPanelShell";
import { TaskPanel } from "@/components/session/TaskPanel";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import type { MissionDetail } from "@/lib/missions/api";
import type { WorkspacePrInfo } from "@/lib/pr-status";
import { isTaskPanelTab, type TaskPanelTab } from "@/lib/right-rail-panels";
import type { ResultReview } from "@/lib/reviews/result-review";
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
 *   verification, an open pull request and one run waiting for review.
 * - `task=mission`: a mission task run by an agent, with a live turn, a running
 *   subagent and a scheduled wake-up.
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

const PLAIN_MESSAGES: ChatMessage[] = [
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
        toolName: "TodoWrite",
        state: "output-available",
        input: JSON.stringify({
          todos: [
            { content: "Read the sidebar layout", status: "completed" },
            { content: "Tighten the row gaps", status: "completed" },
            { content: "Verify keyboard order", status: "in_progress" },
          ],
        }),
      },
      {
        type: "code_diff",
        filePath: "src/components/settings/Sidebar.tsx",
        oldContent: "gap: 12px;\npadding: 16px;\n",
        newContent: "gap: 8px;\npadding: 12px;\nalign-items: center;\n",
        status: "accepted",
      },
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

function missionDetail(): MissionDetail {
  const stage = (id: string, title: string) => ({
    id,
    kind: "ai",
    title,
    instruction: "x",
    doneWhen: "y",
  });
  return {
    mission: {
      id: "mission-task-panel-1",
      workspaceId: WORKSPACE_ID,
      leadTaskId: MISSION_TASK_ID,
      state: "running",
      currentStageIndex: 1,
      createdAt: "2026-09-29T10:00:00.000Z",
      updatedAt: "2026-09-29T10:06:00.000Z",
      assignment: "Add pagination to the /users API endpoint and open a PR.",
      turnCount: 3,
      playbook: {
        name: "Request → PR",
        stages: [stage("plan", "Plan"), stage("build", "Build"), stage("pr", "Open PR")],
      },
    },
    stages: [
      {
        stageId: "plan",
        attempt: 1,
        status: "completed",
        startedAt: "2026-09-29T10:01:00.000Z",
        endedAt: "2026-09-29T10:05:00.000Z",
        detail: null,
        feedback: null,
        report: {
          outcome: "complete",
          summary: "Planned the pagination change.",
          evidence: [{ label: "tests", kind: "check", command: "bun test" }],
          decisions: [],
          acceptanceCriteria: [
            { text: "/users accepts limit and offset", status: "met" },
            { text: "The default page size is documented", status: "unverified" },
          ],
        },
        facts: { toolCalls: [], commands: [{ command: "bun test", exitCode: 0 }] },
      },
      {
        stageId: "build",
        attempt: 1,
        status: "running",
        startedAt: "2026-09-29T10:06:00.000Z",
        endedAt: null,
        detail: null,
        feedback: null,
        report: null,
        facts: null,
      },
    ],
    events: [],
    report: null,
  } as unknown as MissionDetail;
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
  useAppStore.setState({
    repositoryPath: REPOSITORY_PATH,
    repositoryName: "preview-repo",
    defaultBranch: "main",
    activeWorkspaceId: WORKSPACE_ID,
    activeTaskId,
    workspacePathById: { [WORKSPACE_ID]: REPOSITORY_PATH },
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
          <RightRailPanelShell panelId="task">
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
