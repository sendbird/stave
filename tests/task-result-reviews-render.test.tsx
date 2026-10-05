import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RunHistoryRow,
  TaskResultReviews,
} from "@/components/session/TaskResultReviews";
import { ExchangeDetail } from "@/components/delegation/ExchangeDetail";
import { fromDelegatedTask } from "@/lib/delegation/exchange";
import { SubagentsSection } from "@/components/session/SubagentsSection";
import { Accordion } from "@/components/ui/accordion";
import type { ResultReview } from "@/lib/reviews/result-review";
import { ResultFileSnapshots } from "@/components/session/ResultFileSnapshots";
import { RunTurnTranscript } from "@/components/session/RunTurnDialog";
import type { ChatMessage } from "@/types/chat";

test("run history opens as a filterable list with its purpose stated up front", () => {
  const html = renderToStaticMarkup(
    createElement(TaskResultReviews, { workspaceId: "w", taskId: "t" }),
  );
  expect(html).toContain("Saved outputs");
  expect(html).toContain("Saved answers and reported file changes");
  expect(html).toContain("All outputs");
  expect(html).toContain("Unchecked");
  expect(html).toMatch(/aria-pressed="true"[^>]*><span[^>]*>Unchecked/);
  expect(html).toMatch(/aria-pressed="false"[^>]*><span[^>]*>All outputs/);
  expect(html.indexOf("Unchecked")).toBeLessThan(html.indexOf("All outputs"));
  expect(html).not.toContain("Current changes");
  expect(html).not.toContain("Mark checked");
});

test("run history rows lead with the result before review metadata", () => {
  const result: ResultReview = {
    id: "result-1",
    repositoryPath: "/tmp/project",
    repositoryName: "Project",
    workspaceId: "workspace",
    workspaceName: "Workspace",
    taskId: "task",
    taskTitle: "Task",
    turnId: "turn",
    outcome: "completed",
    summary: "Implemented the focused panel hierarchy.",
    createdAt: "2026-09-21T00:00:00Z",
    reviewedAt: null,
  };
  const html = renderToStaticMarkup(
    createElement(
      Accordion,
      {},
      createElement(RunHistoryRow, {
        result,
        expanded: false,
        busy: false,
        disabled: false,
        onReview: () => {},
        onFollowUp: () => {},
      }),
    ),
  );

  expect(html.indexOf(result.summary)).toBeLessThan(html.indexOf("Finished"));
  expect(html.indexOf(result.summary)).toBeLessThan(
    html.indexOf("Unchecked"),
  );
});

test("the Subagents tab says what it lists before any subagent exists", () => {
  const html = renderToStaticMarkup(
    createElement(SubagentsSection, { taskId: "t", workspaceId: "w", repositoryPath: "/tmp/p" }),
  );
  expect(html).toMatch(/Loading subagents|No subagents yet/);
  expect(html).not.toContain("Advisor");
  expect(html).not.toContain("Worker");
});

test("finished execution detail prioritizes the returned result and folds assignment diagnostics", () => {
  const exchange = { ...fromDelegatedTask({
    runId: "child-task:t:review", stepId: "child-task:t:review:turn", parentTaskId: "t", delegationKey: "review",
    delegatedTaskId: "c", delegatedWorkspaceId: "w", delegatedTurnId: "turn", providerId: "codex", lifecycle: "one-turn",
    phase: "completed", reason: null, attempt: 1, createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:02.000Z",
    completedAt: "2026-08-10T00:00:02.000Z", result: "Cancellation verified",
  }, { prompt: "Review cancellation" }), outcome: { status: "returned" as const, result: "Cancellation verified", progress: ["Inspected cancellation"] } };
  const html = renderToStaticMarkup(createElement(ExchangeDetail, { exchange, nowMs: 3, resultFirst: true }));
  expect(html.indexOf("Cancellation verified")).toBeLessThan(html.indexOf("Review cancellation"));
  expect(html).toMatch(/<details><summary[^>]*>Assignment and execution details/);
  expect(html.indexOf("Inspected cancellation")).toBeGreaterThan(html.indexOf("<details>"));
  expect(html).not.toMatch(/<details open/);
});

test("a run's reported files read like the conversation's changed files, without Accept or Reject", () => {
  const html = renderToStaticMarkup(
    createElement(ResultFileSnapshots, {
      taskId: "task",
      evidence: {
        messageId: "message",
        providerId: "claude-code",
        model: "claude-sonnet-5",
        answer: "Done.",
        answerTruncated: false,
        files: ["src/a.ts", "src/b.ts"],
        filesTruncated: false,
        snapshots: [
          { filePath: "src/a.ts", oldContent: "a\n", newContent: "a\nb\n", status: "pending", truncated: false },
        ],
      },
    }),
  );
  expect(html).toContain("Files this run changed");
  expect(html).toContain("1 file edited");
  expect(html).toContain("1 more · contents not saved");
  expect(html).toContain("src/b.ts");
  expect(html).toContain("Open All");
  expect(html).not.toContain("Accept");
  expect(html).not.toContain("Reject");
  expect(html).not.toContain("pending");
});

test("the run transcript renders the prompt and the run with the conversation's components", () => {
  const messages: ChatMessage[] = [
    { id: "u", role: "user", model: "", providerId: "user", content: "Tighten the sidebar", parts: [] },
    {
      id: "a",
      role: "assistant",
      model: "claude-sonnet-5",
      providerId: "claude-code",
      content: "",
      turnId: "turn",
      parts: [
        { type: "tool_use", toolName: "Bash", input: JSON.stringify({ command: "bun run typecheck" }), state: "output-available", output: "ok" },
        { type: "text", text: "Done:\n\n- gaps are **8px**" },
      ],
    } as ChatMessage,
  ];
  const html = renderToStaticMarkup(
    createElement(RunTurnTranscript, { messages, taskId: "task", turnId: "turn" }),
  );
  expect(html).toContain('aria-label="Run transcript"');
  expect(html).toContain("Tighten the sidebar");
  expect(html).toContain("is-user");
  expect(html).toContain("is-assistant");
  expect(html).toContain("<strong");
  expect(html).toContain("data-turn-model-chip");
  expect(html.indexOf("Tighten the sidebar")).toBeLessThan(html.indexOf("gaps are"));
});
