import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShelfReviews } from "@/components/session/composer-shelf/ShelfReviews";
import {
  buildReviewExchange,
  describeReviewShelfFindings,
  describeReviewShelfLine,
  summarizeReviewTranscript,
} from "@/components/session/composer-shelf/composer-shelf.utils";
import { parseReviewFindings } from "@/lib/reviews/review-findings";
import { TaskContextChip } from "@/components/task-context-chip";
import type { ReviewShelfItem } from "@/lib/reviews/review-task";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";

const noop = () => {};
const actions = { attach: noop, open: noop, stop: noop, dismiss: noop };

function review(
  status: ReviewShelfItem["status"],
  overrides: Partial<DelegatedTaskSummary> = {},
): ReviewShelfItem {
  return {
    status,
    child: {
      runId: `run-${status}`,
      stepId: `step-${status}`,
      parentTaskId: "task-1",
      delegationKey: `stave-review-${status}`,
      delegatedTaskId: `review-${status}`,
      delegatedWorkspaceId: "ws-1",
      delegatedTurnId: null,
      providerId: "codex",
      requestedModel: "gpt-5.5",
      lifecycle: "one-turn",
      phase: status === "running" ? "running" : status === "ready" ? "completed" : "failed",
      reason: status === "failed" ? "The workspace HEAD moved." : null,
      attempt: 1,
      createdAt: "2026-10-04T12:00:00.000Z",
      updatedAt: "2026-10-04T12:05:00.000Z",
      completedAt: status === "running" ? null : "2026-10-04T12:05:00.000Z",
      ...overrides,
    },
  };
}

function render(items: ReviewShelfItem[], attached: string[] = []) {
  return renderToStaticMarkup(
    createElement(ShelfReviews, {
      items,
      attachedTaskIds: new Set(attached),
      actions,
      onView: noop,
    }),
  );
}

describe("review lines on the composer shelf", () => {
  test("a running review offers View and Stop, not Attach", () => {
    const html = render([review("running")]);
    expect(html).toContain('data-status="running"');
    expect(html).toContain("Reviewing");
    expect(html).toContain(">View<");
    expect(html).toContain('aria-label="Stop the review"');
    expect(html).not.toContain(">Attach<");
  });

  test("a finished review offers Attach until it is attached", () => {
    expect(render([review("ready")])).toContain(">Attach<");
    const attached = render([review("ready")], ["review-ready"]);
    expect(attached).toContain("Attached");
    expect(attached).not.toContain(">Attach<");
  });

  test("a failed review names the reason and can be dismissed", () => {
    const html = render([review("failed")]);
    expect(html).toContain("Review failed");
    expect(html).toContain("The workspace HEAD moved.");
    expect(html).toContain('aria-label="Dismiss"');
  });
});

describe("viewing a review", () => {
  test("the activity dialog sees the review task, with only open and stop", () => {
    const running = buildReviewExchange({ item: review("running"), title: "Review · Latest reply · GPT-5.5" });
    expect(running.title).toBe("Review · Latest reply · GPT-5.5");
    expect(running.ref).toMatchObject({ delegatedTaskId: "review-running", delegatedWorkspaceId: "ws-1" });
    expect(running.actions.map((action) => action.id)).toEqual(["open", "stop"]);
    const ready = buildReviewExchange({ item: review("ready"), title: "Review" });
    expect(ready.actions.map((action) => action.id)).toEqual(["open"]);
    expect(ready.outcome.status).toBe("returned");
  });

  test("the review task's own prompt and full answer replace the ledger copy", () => {
    const transcript = summarizeReviewTranscript([
      { role: "user", content: "Review the working tree.", isStreaming: false },
      { role: "assistant", content: "Full findings.", isStreaming: false },
      { role: "assistant", content: "partial", isStreaming: true },
    ]);
    expect(transcript).toEqual({ prompt: "Review the working tree.", reply: "Full findings.", replyId: null });
    const ready = buildReviewExchange({
      item: review("ready", { result: "Bounded copy" }),
      title: "Review",
      transcript,
    });
    expect(ready.ask).toBe("Review the working tree.");
    expect(ready.outcome.result).toBe("Full findings.");
    const failed = buildReviewExchange({ item: review("failed"), title: "Review", transcript });
    expect(failed.outcome.error).toBe("The workspace HEAD moved.");
    expect(failed.outcome.result).toBeUndefined();
  });

  test("an attached task chip opens its task when it can", () => {
    const linked = renderToStaticMarkup(
      createElement(TaskContextChip, { title: "Review", scope: "latest-reply", onOpen: noop }),
    );
    expect(linked).toContain('aria-label="Open attached task Review"');
    const plain = renderToStaticMarkup(
      createElement(TaskContextChip, { title: "Review", scope: "latest-reply" }),
    );
    expect(plain).not.toContain("Open attached task");
  });

  test("a chip narrowed to findings says how many it sends instead of a scope", () => {
    const html = renderToStaticMarkup(
      createElement(TaskContextChip, { title: "Review", scope: "latest-reply", findingCount: 2, onScopeChange: noop }),
    );
    expect(html).toContain("2 findings");
    expect(html).not.toContain("Latest reply");
  });

  test("a review line reads its findings: counts, re-checks and unreadable replies", () => {
    const ready = review("ready");
    const summary = (reply: string) =>
      describeReviewShelfLine({ item: ready, now: 0, findings: describeReviewShelfFindings(parseReviewFindings(reply)) });
    const block = (json: unknown) => "```stave-review-findings\n" + JSON.stringify(json) + "\n```";
    expect(
      summary(block({ verdict: "request-changes", findings: [{ severity: "critical", title: "A" }] })),
    ).toMatchObject({ label: "Review ready", tone: "danger" });
    expect(summary(block({ verdict: "approve", findings: [] })).detail).toContain("No findings");
    expect(
      summary(block({ verdict: "approve", previous: [{ id: "F1", status: "resolved" }], findings: [] })),
    ).toMatchObject({ label: "Fixes checked", tone: "ready" });
    expect(summary("no block").detail).toContain("findings unreadable");
    expect(describeReviewShelfLine({ item: ready, now: 0 }).detail).not.toContain("findings");
  });
});
