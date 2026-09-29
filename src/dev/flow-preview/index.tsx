import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { FlowPanel } from "@/components/agents/FlowPanel";
import { TaskWorkPanelHeader } from "@/components/session/TaskWorkPanel";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import type { MissionDetail } from "@/lib/missions/api";
import type { WorkspacePrInfo } from "@/lib/pr-status";
import type { TaskAgent } from "@/store/agent-assignments-store";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useMissionsStore, missionTaskKey } from "@/store/missions-store";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

/**
 * The Flow panel on the dev preview (`?stavePreview=flow`): two tasks seeded
 * straight into the stores with no IPC. (a) A plain task with a plan, changed
 * files, a passing verification and an open pull request. (b) A mission task
 * run by an agent, with the base steps nested under the running stage.
 * `&theme=dark` or `&theme=<built-in theme id>` renders under that theme.
 */
const params = new URLSearchParams(window.location.search);

const WORKSPACE_ID = "flow-preview-ws";
const PLAIN_TASK_ID = "flow-preview-plain";
const MISSION_TASK_ID = "flow-preview-mission";

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
    startedAt: "2026-09-29T09:00:05.000Z",
    completedAt: "2026-09-29T09:03:00.000Z",
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
  assignmentId: "assignment-flow-1",
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
      id: "mission-flow-1",
      workspaceId: WORKSPACE_ID,
      leadTaskId: MISSION_TASK_ID,
      state: "running",
      currentStageIndex: 1,
      createdAt: "2026-09-29T10:00:00.000Z",
      playbook: {
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

function seedStores() {
  const store = useAppStore.getState();
  useAppStore.setState({
    repositoryPath: null,
    defaultBranch: "main",
    activeWorkspaceId: WORKSPACE_ID,
    workspacePathById: { [WORKSPACE_ID]: "/tmp/flow-preview-repo" },
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
    activeTurnIdsByTask: { [MISSION_TASK_ID]: "turn-flow-1" },
    providerTurnActivityByTask: {},
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
    settings: store.settings,
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
}

export function FlowPreview() {
  const theme = params.get("theme");
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === theme) ?? null;
  const [seeded, setSeeded] = useState(false);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: theme === "dark" || builtinTheme?.baseMode === "dark" });
    applyCustomTheme({ theme: builtinTheme });
  }, [theme, builtinTheme]);
  useLayoutEffect(() => {
    seedStores();
    setSeeded(true);
  }, []);
  return (
    <main className={sx(styles.page)}>
      {seeded ? (
        <div className={sx(styles.columns)}>
          <section className={sx(styles.column)} aria-label="Plain task flow">
            <TaskWorkPanelHeader title="Tighten settings sidebar spacing" />
            <FlowPanel workspaceId={WORKSPACE_ID} taskId={PLAIN_TASK_ID} repositoryPath={null} />
          </section>
          <section className={sx(styles.column)} aria-label="Mission task flow">
            <TaskWorkPanelHeader title="Add pagination to /users" />
            <FlowPanel workspaceId={WORKSPACE_ID} taskId={MISSION_TASK_ID} repositoryPath={null} />
          </section>
        </div>
      ) : null}
    </main>
  );
}

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    padding: vars["--ads-space-24"],
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
  },
  columns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: vars["--ads-space-24"],
    alignItems: "start",
  },
  column: {
    minWidth: 0,
    padding: vars["--ads-space-16"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-surface"],
  },
});
