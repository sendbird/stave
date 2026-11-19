import { beforeEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { selectTaskPanelWorkspaceLabel, TaskPanel, TaskPanelView } from "@/components/session/TaskPanel";
import { TaskPanelEmpty } from "@/components/session/TaskPanelEmpty";
import { buildTaskPanelStatus } from "@/components/session/task-panel-state";
import { openTaskInspection } from "@/components/session/task-inspection-navigation";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { TurnHistoryEntry } from "@/lib/providers/turn-history";
import { untitledTaskTitle } from "@/lib/task-context/attached-task-context";
import { DEFAULT_WORKFLOW_PERMISSION_MODE } from "@/lib/workflows/schema";
import {
  RIGHT_RAIL_PANEL_IDS,
  RIGHT_RAIL_PANEL_TITLES,
} from "@/lib/right-rail-panels";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { agentRunDetail, agentRunFixture } from "./fixtures/agent-run-fixtures";

const WORKSPACE_ID = "ws-1";
const TASK_ID = "task-1";

function render(overrides: Partial<Parameters<typeof TaskPanelView>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(TaskPanelView, {
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      repositoryPath: null,
      managed: false,
      taskTitle: "Add CSV export",
      workspaceLabel: "feat/csv-export",
      agentRun: undefined,
      ...overrides,
    }),
  );
}

function agentRun(): AgentRunDetail {
  return agentRunDetail(agentRunFixture({ leadTaskId: TASK_ID }));
}

/** A reply that ended its turn normally, as far as the provider's stop reason says. */
const REPLY: ChatMessage = {
  id: "a1",
  role: "assistant",
  providerId: "claude-code",
  model: "sonnet",
  content: "",
  turnId: "turn-2",
  terminalStopReason: "end_turn",
  parts: [
    { type: "code_diff", filePath: "src/a.ts", oldContent: "", newContent: "a", status: "accepted" },
    { type: "code_diff", filePath: "src/b.ts", oldContent: "", newContent: "b", status: "accepted" },
    { type: "code_diff", filePath: "src/a.ts", oldContent: "a", newContent: "aa", status: "accepted" },
  ],
} as unknown as ChatMessage;

const turn = (id: string, outcome: TurnHistoryEntry["outcome"], error: string | null = null): TurnHistoryEntry => ({
  id, providerId: "claude-code", createdAt: "2026-09-29T08:50:00.000Z", completedAt: "2026-09-29T09:03:00.000Z", outcome, error, digest: null,
});

function status(args: Partial<Parameters<typeof buildTaskPanelStatus>[0]>) {
  return buildTaskPanelStatus({
    messages: [REPLY],
    liveTurnId: null,
    activity: null,
    retained: null,
    history: null,
    agentRun: undefined,
    prInfo: undefined,
    selectedTurnId: null,
    now: Date.parse("2026-09-29T10:00:00.000Z"),
    ...args,
  });
}

beforeEach(() => {
  useAppStore.setState({
    activeWorkspaceId: WORKSPACE_ID,
    activeTaskId: TASK_ID,
    messagesByTask: {},
    activeTurnIdsByTask: {},
    tasks: [
      {
        id: TASK_ID,
        title: "Add CSV export",
        provider: "claude-code",
        updatedAt: "2026-09-26T10:00:00.000Z",
        unread: false,
        controlMode: "interactive",
        controlOwner: "stave",
      },
    ],
  } as never);
  useAppStore.getState().setLayout({ patch: { sidebarOverlayVisible: false } });
});

test("the rail has one Task entry, read as one screen with no tabs", () => {
  expect(RIGHT_RAIL_PANEL_IDS).toEqual(["explorer", "changes", "information", "skills", "scripts", "task"]);
  expect(RIGHT_RAIL_PANEL_TITLES.task).toBe("Task");
  const html = render();
  expect(html).not.toContain('role="tablist"');
  expect(html).not.toContain('role="tab"');
  expect(html).not.toContain("Handoff");
  // One bar with the panel's title; the caption follows it.
  expect(html.match(/<header/g)).toHaveLength(1);
  expect(html).toMatch(/<header[^>]*>.*<h2[^>]*>.*Task.*<\/h2>.*<\/header><div[^>]*><p/s);
});

test("a caption under the bar names the task and its workspace", () => {
  const html = render();
  const caption = /<\/header><div[^>]*><p[^>]*title="([^"]*)"[^>]*>(.*?)<\/p>/s.exec(html);
  expect(caption?.[1]).toBe("Add CSV export · feat/csv-export");
  // The dot is drawn, not read; the words stay apart for a screen reader.
  expect(caption?.[2]).toMatch(/^<span[^>]*>Add CSV export<\/span> <span aria-hidden="true"[^>]*>·<\/span> <span[^>]*>feat\/csv-export<\/span>$/);
  const other = render({ taskTitle: "Fix the login redirect", workspaceLabel: "main" });
  expect(other).toContain('title="Fix the login redirect · main"');
  expect(other).not.toContain("Add CSV export");
});

test("Details start collapsed and mount nothing until opened", () => {
  const html = render({ repositoryPath: "/tmp/repo", agentRun: agentRun() });
  expect(html).toMatch(/<details[^>]*data-testid="task-details"(?![^>]*\sopen)/);
  expect(html).toContain(">Details<");
  expect(html).not.toContain('data-testid="agent-run-panel"');
  expect(html).not.toContain('aria-label="Flow"');
});

test("a never-run task says so instead of claiming a state", () => {
  const html = render();
  expect(html).toContain("Nothing has run in this task yet.");
  expect(html).not.toContain("data-task-state=");
});

test("a running run reads Working and lists only its open conditions", () => {
  const html = render({ agentRun: agentRun() });
  expect(html).toContain('data-task-state="working"');
  expect(html).toContain(">Working<");
  // Nothing waits on the user and nothing finished: neither section shows.
  expect(html).not.toContain(">What you need to do<");
  expect(html).not.toContain(">Result<");
});

test("a sign-off puts what to do first, with the action that answers it", () => {
  const needsYou = agentRun();
  needsYou.stages = needsYou.stages.map((stage, index) =>
    index === needsYou.agentRun.currentStageIndex ? { ...stage, status: "awaiting-sign-off" } : stage,
  );
  const html = render({ agentRun: needsYou });
  expect(html).toContain('data-task-state="waiting"');
  expect(html).toContain(">What you need to do<");
  expect(html).toContain(">Review request<");
});

test("the turn's saved record decides how it ended, so the state never contradicts it", () => {
  // The reply's stop reason alone reads as completed; the record says it failed.
  expect(status({}).status).toMatchObject({ state: "finished" });
  const failed = status({ history: [turn("turn-2", "failed", "Stream closed before the turn finished.")] });
  expect(failed.status).toEqual({ state: "stopped", waitingOn: null, reason: "Stream closed before the turn finished.", result: null });
  // Opened on that failure: Details open on it.
  expect(failed.focusDetails).toBe(true);
  // A stop the user made is not a failure to open on.
  expect(status({ history: [turn("turn-2", "cancelled")] }).focusDetails).toBe(false);
});

test("a finished turn leads with the pull request, the files it changed and its answer", () => {
  const view = status({
    history: [turn("turn-2", "completed")],
    prInfo: { pr: { number: 128, title: "Add CSV export", url: "https://example.test/128" }, derived: "review_required", lastFetched: 0 } as never,
  });
  expect(view.status).toMatchObject({
    state: "finished",
    result: { pullRequest: { url: "https://example.test/128", number: 128, title: "Add CSV export" }, changedFiles: 2, answerMessageId: "a1" },
  });
  expect(view.focusDetails).toBe(false);
});

test("picking an earlier turn moves the title and the state to that turn", () => {
  const earlier: ChatMessage = { ...REPLY, id: "a0", turnId: "turn-1", parts: [] };
  const history = [turn("turn-2", "failed", "Boom"), { ...turn("turn-1", "completed"), createdAt: "2026-09-29T08:30:00.000Z" }];
  const current = status({ messages: [earlier, REPLY], history });
  expect(current).toMatchObject({ turnId: "turn-2", pastTurnAt: null, status: { state: "stopped" } });
  const past = status({ messages: [earlier, REPLY], history, selectedTurnId: "turn-1" });
  expect(past).toMatchObject({
    turnId: "turn-1",
    pastTurnAt: "2026-09-29T08:30:00.000Z",
    status: { state: "finished", result: { pullRequest: null, changedFiles: 0, answerMessageId: "a0" } },
    remaining: [],
    focusDetails: false,
  });
  // Picking the current turn again is no past turn.
  expect(status({ messages: [earlier, REPLY], history, selectedTurnId: "turn-2" }).pastTurnAt).toBeNull();
});

test("a live turn's open question is what the user must do", () => {
  const asking: ChatMessage = {
    ...REPLY,
    id: "a3",
    turnId: "turn-3",
    terminalStopReason: undefined,
    parts: [{
      type: "user_input", toolName: "AskUserQuestion", requestId: "q1", state: "input-requested",
      questions: [{ question: "Which plan gets the export?", header: "Plan", options: [] }],
    }],
  } as unknown as ChatMessage;
  const view = status({ messages: [REPLY, asking], liveTurnId: "turn-3" });
  expect(view.status).toMatchObject({ state: "waiting", waitingOn: "question" });
  expect(view.request).toEqual({ messageId: "a3", requestId: "q1", text: "Which plan gets the export?" });
});

test("the connected panel with no task says why and starts one", () => {
  useAppStore.setState({ activeTaskId: "", tasks: [] } as never);
  expect(renderToStaticMarkup(createElement(TaskPanel))).toContain("No task open");
  const html = renderToStaticMarkup(createElement(TaskPanelEmpty, { hasWorkspace: true }));
  expect(html).toContain("New task");
  expect(html).not.toContain("Handoff");
  const none = renderToStaticMarkup(createElement(TaskPanelEmpty, { hasWorkspace: false }));
  expect(none).toContain("Select a workspace in the sidebar");
  expect(none).not.toContain("New task");
});

test("the caption names the workspace by its own name, else its branch", () => {
  const state = {
    activeWorkspaceId: WORKSPACE_ID,
    workspaces: [{ id: WORKSPACE_ID, name: "Default Workspace", updatedAt: "2026-09-26T10:00:00.000Z" }],
    workspaceBranchById: { [WORKSPACE_ID]: "main" },
    workspaceDefaultById: { [WORKSPACE_ID]: true },
  };
  expect(selectTaskPanelWorkspaceLabel(state)).toBe("main");
  expect(selectTaskPanelWorkspaceLabel({
    ...state,
    workspaces: [{ id: WORKSPACE_ID, name: "billing-export", updatedAt: "2026-09-26T10:00:00.000Z" }],
    workspaceBranchById: { [WORKSPACE_ID]: "feat/billing-export" },
    workspaceDefaultById: { [WORKSPACE_ID]: false },
  })).toBe("billing-export");
  expect(untitledTaskTitle("  ")).toBe("Untitled task");
});

test("openTaskInspection opens the Task panel for a task in the active workspace", () => {
  openTaskInspection(WORKSPACE_ID, TASK_ID);
  expect(useAppStore.getState().layout).toMatchObject({ sidebarOverlayVisible: true, sidebarOverlayTab: "task" });
  expect("taskPanelTab" in useAppStore.getState().layout).toBe(false);
  useAppStore.getState().setLayout({ patch: { sidebarOverlayVisible: false } });
  // Another workspace's task is not opened in this one.
  openTaskInspection("ws-other", TASK_ID);
  expect(useAppStore.getState().layout.sidebarOverlayVisible).toBe(false);
});

test("a workflow without a permission mode runs Auto", () => {
  expect(DEFAULT_WORKFLOW_PERMISSION_MODE).toBe("auto");
});

test("the panel's run figures leave out the ones nothing reported instead of drawing empty cells", async () => {
  const { TaskExecutionSummarySurface } = await import("@/components/layout/TaskExecutionSummarySurface");
  const { buildTaskExecutionSummary } = await import("@/lib/fleet/task-execution-summary");
  const summary = buildTaskExecutionSummary({
    providerId: "claude-code",
    messages: [{
      id: "a1", role: "assistant", model: "opus", providerId: "claude-code", content: "",
      startedAt: "2026-07-31T00:00:00.000Z", completedAt: "2026-07-31T00:00:02.000Z",
      parts: [{ type: "code_diff", filePath: "src/a.ts", oldContent: "", newContent: "a", status: "accepted" }],
    } as unknown as ChatMessage],
  });
  const props = { summary, compact: true, layout: "panel" as const, showLatestActivity: false, omitKeys: ["elapsed", "agents"] as const };
  expect(renderToStaticMarkup(createElement(TaskExecutionSummarySurface, props))).toContain("Not reported");
  const panel = renderToStaticMarkup(createElement(TaskExecutionSummarySurface, { ...props, omitUnreported: true }));
  expect(panel).not.toContain("Not reported");
  expect(panel).toContain("1 file");
});

// Review E-fix: each case below failed before its fix.

/** A question card an earlier turn left open, async so it never blocked that turn. */
const OLD_ASYNC_QUESTION: ChatMessage = {
  ...REPLY,
  id: "a-old",
  turnId: "turn-1",
  parts: [{
    type: "user_input", toolName: "AskUserQuestion", requestId: "q-old", state: "input-requested", delivery: "async",
    questions: [{ question: "Which billing plan first?", header: "Plan", options: [] }],
  }],
} as unknown as ChatMessage;

/** The live turn asks for an approval. */
const LIVE_APPROVAL: ChatMessage = {
  ...REPLY,
  id: "a-live",
  turnId: "turn-3",
  terminalStopReason: undefined,
  parts: [{
    type: "approval", toolName: "Bash", requestId: "ap-live", state: "approval-requested", description: "Run bun run migrate",
  }],
} as unknown as ChatMessage;

test("F1: the state, its words and the jump target come from the same request", () => {
  const view = status({
    messages: [OLD_ASYNC_QUESTION, REPLY, LIVE_APPROVAL],
    liveTurnId: "turn-3",
    activity: { turnId: "turn-3", pendingInteraction: "approval" } as never,
  });
  expect(view.status).toMatchObject({ state: "waiting", waitingOn: "approval" });
  expect(view.request).toEqual({ messageId: "a-live", requestId: "ap-live", text: "Run bun run migrate" });
  // With no live turn the older question leads, and so do its words.
  const settled = status({ messages: [OLD_ASYNC_QUESTION, REPLY, { ...LIVE_APPROVAL, turnId: "turn-2" }] });
  expect(settled.status).toMatchObject({ state: "waiting", waitingOn: "question" });
  expect(settled.request?.requestId).toBe("q-old");
});

test("F2: a newer saved turn than the restored messages decides, and its answer is never an older turn's", () => {
  const history = [turn("turn-3", "failed", "Stream closed."), turn("turn-2", "completed")];
  const view = status({ messages: [REPLY], history });
  expect(view.turnId).toBe("turn-3");
  expect(view.status).toMatchObject({ state: "stopped", reason: "Stream closed.", result: null });
  // The newest message turn missing from history: the later start wins.
  const later = { ...turn("turn-9", "failed", "Boom"), createdAt: "2026-09-29T11:00:00.000Z" };
  const timed = status({ messages: [{ ...REPLY, startedAt: "2026-09-29T10:00:00.000Z" } as ChatMessage], history: [later] });
  expect(timed).toMatchObject({ turnId: "turn-9", status: { state: "stopped" } });
  // The messages reach the newest saved turn: it still follows the messages.
  expect(status({ messages: [REPLY], history: [turn("turn-2", "completed"), turn("turn-1", "completed")] }).turnId).toBe("turn-2");
});

test("F3: a run waiting for its usage reset waits on nobody and says when it resumes", () => {
  const detail = agentRun();
  detail.agentRun = {
    ...detail.agentRun,
    state: "paused",
    pauseReason: "usage-limit",
    usageLimit: {
      turnId: "turn-2", resetsAt: "2026-09-29T15:00:00.000Z", resumeAt: "2026-09-29T15:01:00.000Z",
      accountProfileId: "work", fingerprint: { providerId: "claude-code", model: "sonnet" },
    },
  } as AgentRunDetail["agentRun"];
  const view = status({ messages: [], agentRun: detail });
  expect(view.status?.state).toBe("on-hold");
  expect(view.status?.reason).toContain("Waiting for usage reset at");
  const html = render({ agentRun: detail });
  expect(html).toContain('data-task-state="on-hold"');
  expect(html).not.toContain(">Working<");
  expect(html).not.toContain(">What you need to do<");
  expect(html).toContain(">Resumes on its own<");
});

test("F4: an earlier turn without a saved record ends as its own message says", () => {
  const aborted: ChatMessage = { ...REPLY, id: "a0", turnId: "turn-1", parts: [], terminalStopReason: "user_abort" } as unknown as ChatMessage;
  const view = status({ messages: [aborted, REPLY], history: [turn("turn-2", "completed")], selectedTurnId: "turn-1" });
  expect(view).toMatchObject({ turnId: "turn-1", status: { state: "stopped", reason: "You stopped it." } });
});

test("F5: the files counted and the changes Review opens are the same scope", () => {
  const base = agentRun();
  const ai = base.agentRun.workflow.stages.filter((stage) => stage.kind === "ai").at(-1)!;
  const record = {
    ...base.stages[0]!, stageId: ai.id, attempt: 1, status: "completed", startHeadSha: "abc123",
    facts: { diff: { filesChanged: 4, insertions: 10, deletions: 2 } },
  };
  const detail = { ...base, agentRun: { ...base.agentRun, state: "completed" }, stages: [...base.stages.filter((row) => row.stageId !== ai.id), record] } as never as AgentRunDetail;
  const view = status({ history: [turn("turn-2", "completed")], agentRun: detail });
  expect(view.status?.result?.changedFiles).toBe(4);
  expect(view.reviewStage).toEqual({ agentRunId: base.agentRun.id, stageId: ai.id, attempt: 1 });
  // Without a run, the turn's own files and the turn's review.
  const plain = status({ history: [turn("turn-2", "completed")] });
  expect(plain.status?.result?.changedFiles).toBe(2);
  expect(plain.reviewStage).toBeNull();
});
