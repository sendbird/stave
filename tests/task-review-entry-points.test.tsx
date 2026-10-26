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
import { ReviewScopeBar } from "@/components/review/ReviewScopeBar";
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
function renderHeader(args: { taskId: string; reviewShown: boolean; messages?: unknown[]; activeTurnId?: string }) {
  const app = useAppStore.getInitialState() as unknown as { messagesByTask: Record<string, unknown>; activeTurnIdsByTask: Record<string, string> };
  const review = useTaskReviewModeStore.getInitialState() as unknown as { byTask: Record<string, unknown> };
  const saved = { messagesByTask: app.messagesByTask, activeTurnIdsByTask: app.activeTurnIdsByTask, byTask: review.byTask };
  app.messagesByTask = args.messages ? { [args.taskId]: args.messages } : {};
  app.activeTurnIdsByTask = args.activeTurnId ? { [args.taskId]: args.activeTurnId } : {};
  review.byTask = { [args.taskId]: { mode: args.reviewShown ? "review" : "conversation" } };
  try {
    return renderToStaticMarkup(createElement(TaskPaneHeaderActions, { taskId: args.taskId }));
  } finally {
    app.messagesByTask = saved.messagesByTask;
    app.activeTurnIdsByTask = saved.activeTurnIdsByTask;
    review.byTask = saved.byTask;
  }
}

/** The header's mode switch: each item's text and whether it shows pressed. */
function modeSwitch(markup: string) {
  return [...markup.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/g)]
    .map((match) => ({ pressed: match[1] === "true", label: match[2]!.replace(/<[^>]+>/g, "").trim() }));
}

const editMessage = (turnId: string, parts: CodeDiffPart[]) => ({ id: `m-${turnId}`, role: "assistant", content: "", parts, turnId });

describe("the pane header's mode switch", () => {
  afterEach(() => applyAppLocale("en"));

  test("shows which of the conversation and Review is open, in English and Korean", () => {
    expect(modeSwitch(renderHeader({ taskId: "header-task", reviewShown: false }))).toEqual([
      { pressed: true, label: "Conversation" },
      { pressed: false, label: "Review" },
    ]);
    expect(modeSwitch(renderHeader({ taskId: "header-task", reviewShown: true }))).toEqual([
      { pressed: false, label: "Conversation" },
      { pressed: true, label: "Review" },
    ]);
    applyAppLocale("ko");
    expect(modeSwitch(renderHeader({ taskId: "header-task", reviewShown: true }))).toEqual([
      { pressed: false, label: "대화" },
      { pressed: true, label: "검토" },
    ]);
  });

  test("Review carries the latest finished turn's line counts, and none while nothing changed", () => {
    const second: CodeDiffPart = { ...PART, filePath: "src/billing/Total.ts", oldContent: "", newContent: "a\nb" };
    const markup = renderHeader({ taskId: "header-edits", reviewShown: false, messages: [editMessage("t1", [PART, second])] });
    expect(modeSwitch(markup)[1]).toEqual({ pressed: false, label: "Review+3−1" });
    expect(markup).toContain('data-testid="pane-header-review-changes"');
    const quiet = renderHeader({ taskId: "header-quiet", reviewShown: false, messages: [editMessage("t1", [])] });
    expect(quiet).not.toContain('data-testid="pane-header-review-changes"');
  });

  test("a running turn's edits wait until it ends; the turn before it is counted", () => {
    const markup = renderHeader({
      taskId: "header-running",
      reviewShown: false,
      messages: [editMessage("done", [PART]), editMessage("running", [{ ...PART, filePath: "x.ts", oldContent: "", newContent: "1\n2\n3\n" }])],
      activeTurnId: "running",
    });
    expect(modeSwitch(markup)[1]!.label).toBe("Review+1−1");
  });

  test("the side question no longer sits in the header", () => {
    expect(renderHeader({ taskId: "header-codex", reviewShown: false })).not.toContain("side-question");
  });
});

describe("Review's scope bar", () => {
  const render = (onSideQuestion?: () => void) =>
    renderToStaticMarkup(createElement(ReviewScopeBar, {
      scope: { kind: "uncommitted" },
      available: ["uncommitted"],
      data: null,
      onScope: () => {},
      onRefresh: () => {},
      onConversation: () => {},
      onSideQuestion,
    }));

  test("offers the side question over Review, where the composer is hidden", () => {
    const markup = render(() => {});
    expect(markup).toContain('data-testid="review-side-question"');
    expect(markup).toContain(">Side question<");
  });

  test("leaves it out for a provider without side questions", () => {
    expect(render()).not.toContain('data-testid="review-side-question"');
  });
});
