import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { describeReviewReadError } from "../src/components/review/review-errors";
import { isReviewDiffShown } from "../src/components/review/ReviewDiffPane";
import { ReviewFileList } from "../src/components/review/ReviewFileList";
import { ReviewScopeBar, ReviewScopeLimits } from "../src/components/review/ReviewScopeBar";
import { TaskReviewSurface } from "../src/components/review/TaskReviewSurface";
import { ReviewReadError, type ReviewData } from "../src/components/review/useReviewData";
import { AsyncBoundary } from "../src/components/system/AsyncBoundary";
import { useTaskReviewModeStore } from "../src/store/task-review-mode-store";

const data: ReviewData = { files: [], limits: [], baseSha: "abc1234def", baseRef: "origin/main", headSha: "9876543210", missing: false };

afterEach(() => {
  applyAppLocale("en");
  useTaskReviewModeStore.setState({ byTask: {}, readByTask: {} });
});

/** The opening tags of the toggle buttons, with their labels. */
function toggles(markup: string): Array<{ label: string; pressed: boolean }> {
  return [...markup.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/g)].map((match) => ({
    label: match[2]!.replace(/<[^>]+>/g, "").trim(),
    pressed: match[1] === "true",
  }));
}

describe("Review surface", () => {
  test("a file counts as read only once its diff has shown, never on a refused or failed read", () => {
    expect(isReviewDiffShown({ status: "ready" })).toBe(true);
    expect(isReviewDiffShown({ status: "pending" })).toBe(false);
    expect(isReviewDiffShown({ status: "error" })).toBe(false);
  });

  test("the scope bar offers only the scopes the task has and says what each compares", () => {
    const render = (scope: Parameters<typeof ReviewScopeBar>[0]["scope"], available: Parameters<typeof ReviewScopeBar>[0]["available"]) =>
      renderToStaticMarkup(createElement(ReviewScopeBar, { scope, available, data, onScope: () => {}, onRefresh: () => {}, onConversation: () => {} }));
    const plain = render({ kind: "branch" }, ["turn", "branch", "uncommitted"]);
    expect(toggles(plain)).toEqual([{ label: "This turn", pressed: false }, { label: "Branch", pressed: true }, { label: "Uncommitted", pressed: false }]);
    expect(plain).toContain("Since abc1234, where the branch left origin/main, to the working tree at 9876543");
    const stage = render({ kind: "stage", agentRunId: "run", stageId: "build", attempt: 1 }, ["turn", "stage", "branch", "uncommitted"]);
    expect(stage).toContain("This stage");
    expect(stage).toContain("Since abc1234, where the stage started, to the working tree at 9876543");
    expect(render({ kind: "turn", taskId: "t", turnId: "u" }, ["turn"])).toContain("Edits the agent reported in this turn");
    expect(render({ kind: "uncommitted" }, ["uncommitted"])).toContain("Working tree against HEAD 9876543");
  });

  test("the turn scope states that shell edits are not shown; a stage states that later edits merge", () => {
    expect(renderToStaticMarkup(createElement(ReviewScopeLimits, { limits: ["reported-edits-only"] }))).toContain("Changes made through shell commands are not here");
    expect(renderToStaticMarkup(createElement(ReviewScopeLimits, { limits: ["later-edits-merge"] }))).toContain("cannot be told apart from the stage");
    expect(renderToStaticMarkup(createElement(ReviewScopeLimits, { limits: [] }))).toBe("");
  });

  test("a stage's files are grouped as its own and changed after it, and opened files read as read", () => {
    const markup = renderToStaticMarkup(createElement(ReviewFileList, {
      files: [
        { path: "src/a.ts", status: "modified", additions: 3, deletions: 1, origin: "stage" },
        { path: "src/b.ts", status: "modified", additions: 1, deletions: 0, origin: "after-stage" },
      ],
      selected: "src/a.ts",
      read: ["src/a.ts"],
      onSelect: () => {},
    }));
    expect(markup).toContain("This stage (1)");
    expect(markup).toContain("After the stage (1)");
    expect(markup).toContain("1 of 2 read");
    expect(markup).toContain('aria-label="src/a.ts, Modified, read"');
    expect(markup).toContain('aria-label="src/b.ts, Modified"');
  });

  test("a failed read says why and offers Retry; it never reads as no changes", () => {
    const failed = renderToStaticMarkup(createElement(AsyncBoundary<ReviewData>, {
      state: { status: "error", error: new ReviewReadError("no-stage-start") },
      onRetry: () => {},
      describeError: describeReviewReadError,
      children: () => "files",
    }));
    expect(failed).toContain("This stage has no recorded start commit");
    expect(failed).toContain("Retry");
    expect(failed).not.toContain("No changes in this scope");
    expect(describeReviewReadError(new ReviewReadError("failed", "fatal: bad object"))).toBe("Could not read the changes: fatal: bad object");
  });

  test("the surface is a labelled region that starts with its scope and reads before showing files", () => {
    useTaskReviewModeStore.getState().openReview("task-1", { kind: "uncommitted" });
    const markup = renderToStaticMarkup(createElement(TaskReviewSurface, { taskId: "task-1" }));
    expect(markup).toContain('aria-label="Review"');
    expect(markup).toContain('aria-label="Review scope"');
    expect(markup).toContain("Changed files");
    expect(markup).toContain("Completion checks");
    expect(markup).toContain("This task has no agent run, so it has no completion checks.");
  });

  test("Review starts with the way back to the conversation, in English and Korean", () => {
    useTaskReviewModeStore.getState().openReview("task-1", { kind: "uncommitted" });
    const back = (markup: string) =>
      markup.match(/<button[^>]*data-testid="review-back-to-conversation"[^>]*>(.*?)<\/button>/)?.[1]?.replace(/<[^>]+>/g, "").trim();
    const render = () => renderToStaticMarkup(createElement(TaskReviewSurface, { taskId: "task-1" }));
    expect(back(render())).toBe("Conversation");
    applyAppLocale("ko");
    expect(back(render())).toBe("대화");
  });

  test("the mode is session state: opening Review on a scope, switching back, and reading files", () => {
    const store = useTaskReviewModeStore.getState();
    store.openReview("task-2", { kind: "turn", taskId: "task-2", turnId: "turn-1" });
    store.markRead("task-2", { kind: "turn", taskId: "task-2", turnId: "turn-1" }, "src/a.ts");
    store.toggle("task-2");
    expect(useTaskReviewModeStore.getState().byTask["task-2"]).toEqual({ mode: "conversation", scope: { kind: "turn", taskId: "task-2", turnId: "turn-1" } });
    expect(useTaskReviewModeStore.getState().readByTask["task-2"]).toEqual({ "turn:turn-1": ["src/a.ts"] });
  });
});
