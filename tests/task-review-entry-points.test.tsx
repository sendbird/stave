import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { registerPaneHostController } from "@/components/panes/pane-host-controller";
import { TaskPaneHeaderActions } from "@/components/panes/TaskPaneHeaderActions";
import {
  openTaskReview,
  openTaskSideQuestion,
  showTaskConversation,
  toggleTaskReview,
} from "@/components/panes/task-surface-entry";
import { ChangedFilesBlock } from "@/components/session/chat-panel-file-blocks";
import type { PaneSurfaceDescriptor } from "@/lib/panes/types";
import { useAppStore } from "@/store/app.store";
import { useSideChatStore } from "@/store/side-chat-store";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";
import type { CodeDiffPart } from "@/types/chat";

const TASK = "task-entry-points";
const MESSAGE = "message-with-edits";
const TURN = "turn-with-edits";
const PART: CodeDiffPart = {
  type: "code_diff",
  filePath: "src/billing/BillingTable.tsx",
  oldContent: "export const width = 960;\n",
  newContent: "export const width = 600;\n",
  status: "accepted",
};

/** Server rendering reads the store's initial state for subscriptions; the turn id is read from the live state. */
function renderCard(args: { offerTurnReview?: boolean; readOnly?: boolean; liveTurnId?: string }) {
  useAppStore.setState((state) => ({
    messagesByTask: {
      ...state.messagesByTask,
      [TASK]: [{ id: MESSAGE, role: "assistant", content: "", parts: [PART], turnId: TURN }] as never,
    },
  }));
  const initial = useAppStore.getInitialState() as unknown as { activeTurnIdsByTask: Record<string, string> };
  const saved = initial.activeTurnIdsByTask;
  initial.activeTurnIdsByTask = args.liveTurnId ? { [TASK]: args.liveTurnId } : {};
  try {
    return renderToStaticMarkup(createElement(ChangedFilesBlock, {
      parts: [PART],
      taskId: TASK,
      messageId: MESSAGE,
      offerTurnReview: args.offerTurnReview,
      readOnly: args.readOnly,
    }));
  } finally {
    initial.activeTurnIdsByTask = saved;
  }
}

const REVIEW_BUTTON = 'data-testid="changed-files-review-turn"';

describe("the turn's changed-files card", () => {
  test("offers Review on a finished turn, beside Open in editor", () => {
    const html = renderCard({ offerTurnReview: true });
    expect(html).toContain(REVIEW_BUTTON);
    expect(html).toContain('aria-label="Review this turn&#x27;s changes"');
    expect(html).toContain("Open in editor");
    expect(html).not.toContain("Open All");
  });

  test("holds Review back while its turn still runs", () => {
    expect(renderCard({ offerTurnReview: true, liveTurnId: TURN })).not.toContain(REVIEW_BUTTON);
    expect(renderCard({ offerTurnReview: true, liveTurnId: "a-later-turn" })).toContain(REVIEW_BUTTON);
  });

  test("offers no Review outside the conversation's own card", () => {
    expect(renderCard({ offerTurnReview: true, readOnly: true })).not.toContain(REVIEW_BUTTON);
    expect(renderCard({})).not.toContain(REVIEW_BUTTON);
  });
});

describe("task surface entry points", () => {
  let opened: PaneSurfaceDescriptor[] = [];
  let unregister: () => void = () => {};

  beforeEach(() => {
    opened = [];
    unregister = registerPaneHostController({
      openSurface: (surface: PaneSurfaceDescriptor) => {
        opened.push(surface);
        return true;
      },
    } as never);
    useAppStore.setState({ activeSurface: { kind: "editor", editorTabId: "file:README.md" } } as never);
    useTaskReviewModeStore.setState({ byTask: {}, readByTask: {} });
    useSideChatStore.setState({ openTaskId: null });
  });

  afterEach(() => unregister());

  test("Review opens on the named turn and brings the task to the front", () => {
    openTaskReview(TASK, { kind: "turn", taskId: TASK, turnId: TURN });
    expect(opened).toEqual([{ kind: "task", taskId: TASK }]);
    expect(useTaskReviewModeStore.getState().byTask[TASK]).toEqual({
      mode: "review",
      scope: { kind: "turn", taskId: TASK, turnId: TURN },
    });
  });

  test("the toggle switches Review on and back off", () => {
    toggleTaskReview(TASK);
    expect(useTaskReviewModeStore.getState().byTask[TASK]?.mode).toBe("review");
    toggleTaskReview(TASK);
    expect(useTaskReviewModeStore.getState().byTask[TASK]?.mode).toBe("conversation");
  });

  test("the side question opens on the task's surface", () => {
    openTaskSideQuestion(TASK);
    expect(opened).toEqual([{ kind: "task", taskId: TASK }]);
    expect(useSideChatStore.getState().openTaskId).toBe(TASK);
  });

  test("a task already in front is not opened again", () => {
    useAppStore.setState({ activeSurface: { kind: "task", taskId: TASK } } as never);
    openTaskSideQuestion(TASK);
    expect(opened).toEqual([]);
    expect(useSideChatStore.getState().openTaskId).toBe(TASK);
  });

  test("going back to the conversation asks the composer for the cursor", () => {
    openTaskReview(TASK, { kind: "uncommitted" });
    const before = useAppStore.getState().promptFocusNonce;
    showTaskConversation(TASK);
    expect(useTaskReviewModeStore.getState().byTask[TASK]).toEqual({ mode: "conversation", scope: { kind: "uncommitted" } });
    expect(useAppStore.getState().promptFocusNonce).toBe(before + 1);
  });

  test("nothing opens without a task", () => {
    const before = useAppStore.getState().promptFocusNonce;
    openTaskReview("");
    toggleTaskReview("");
    openTaskSideQuestion("");
    showTaskConversation("");
    expect(opened).toEqual([]);
    expect(useAppStore.getState().promptFocusNonce).toBe(before);
    expect(useTaskReviewModeStore.getState().byTask).toEqual({});
    expect(useSideChatStore.getState().openTaskId).toBeNull();
  });
});

/** Server rendering reads each store's initial state, so the case is written there for one render. */
function renderHeader(args: { taskId: string; provider: string; reviewShown: boolean }) {
  const app = useAppStore.getInitialState() as unknown as { tasks: unknown[] };
  const review = useTaskReviewModeStore.getInitialState() as unknown as { byTask: Record<string, unknown> };
  const saved = { tasks: app.tasks, byTask: review.byTask };
  app.tasks = [{ id: args.taskId, title: args.taskId, provider: args.provider, updatedAt: "2026-10-23T00:00:00.000Z", unread: false }];
  review.byTask = { [args.taskId]: { mode: args.reviewShown ? "review" : "conversation" } };
  try {
    return renderToStaticMarkup(createElement(TaskPaneHeaderActions, { taskId: args.taskId }));
  } finally {
    app.tasks = saved.tasks;
    review.byTask = saved.byTask;
  }
}

/** The header's Review switch: its label and whether it shows pressed. */
function reviewSwitch(markup: string) {
  const match = markup.match(/<button[^>]*aria-pressed="(true|false)"[^>]*data-testid="pane-header-review"[^>]*>(.*?)<\/button>/)
    ?? markup.match(/<button[^>]*data-testid="pane-header-review"[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/);
  return match ? { pressed: match[1] === "true", label: match[2]!.replace(/<[^>]+>/g, "").trim() } : null;
}

describe("the pane header's task actions", () => {
  afterEach(() => applyAppLocale("en"));

  test("the Review switch shows pressed while Review is open, in English and Korean", () => {
    expect(reviewSwitch(renderHeader({ taskId: "header-task", provider: "claude-code", reviewShown: false }))).toEqual({ pressed: false, label: "Review" });
    expect(reviewSwitch(renderHeader({ taskId: "header-task", provider: "claude-code", reviewShown: true }))).toEqual({ pressed: true, label: "Review" });
    applyAppLocale("ko");
    expect(reviewSwitch(renderHeader({ taskId: "header-task", provider: "claude-code", reviewShown: true }))).toEqual({ pressed: true, label: "검토" });
  });

  test("every task gets the Review switch; only Claude and Codex tasks get the side question", () => {
    const codex = renderHeader({ taskId: "header-codex", provider: "codex", reviewShown: false });
    expect(codex).toContain('data-testid="pane-header-side-question"');
    expect(reviewSwitch(codex)).not.toBeNull();
    const kiro = renderHeader({ taskId: "header-kiro", provider: "kiro", reviewShown: false });
    expect(kiro).not.toContain('data-testid="pane-header-side-question"');
    expect(reviewSwitch(kiro)).not.toBeNull();
  });
});
