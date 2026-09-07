import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FleetAttentionInbox } from "@/components/layout/FleetAttentionInbox";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";

function buildAttentionItem(overrides: Partial<FleetAttentionItem> = {}): FleetAttentionItem {
  return {
    id: "interaction:user-input:workspace-1:task-1:request-1",
    kind: "user-input",
    priority: 0,
    projectPath: "/workspace/project",
    projectName: "Project",
    workspaceId: "workspace-1",
    workspaceName: "checkout",
    taskId: "task-1",
    taskTitle: "Review checkout",
    requestId: "request-1",
    notificationId: "notification-1",
    createdAt: "2026-07-26T00:00:00.000Z",
    source: "notification",
    ...overrides,
  };
}

function renderInbox(
  items: FleetAttentionItem[],
  overrides: { snoozedCount?: number; selectedAttentionId?: string } = {},
) {
  return renderToStaticMarkup(
    createElement(FleetAttentionInbox, {
      items,
      selectedAttentionId: null,
      busyAttentionId: null,
      onOpen: () => {},
      onOpenTask: () => {},
      onMarkRead: () => {},
      onDismiss: () => {},
      onSnooze: () => {},
      onOpenPr: () => {},
      onClearReview: () => {},
      onRestoreSnoozed: () => {},
      onClearSelection: () => {},
      ...overrides,
    }),
  );
}

const REVIEW_ITEM = buildAttentionItem({
  id: "turn:result-ready:workspace-1:task-1:turn-1",
  kind: "result-ready",
  priority: 4,
  requestId: undefined,
  turnId: "turn-1",
});

describe("FleetAttentionInbox", () => {
  test("offers a dismiss action for notification-backed questions", () => {
    expect(renderInbox([buildAttentionItem()])).toContain("Dismiss");
  });

  test("offers a dismiss action for notification-backed approvals", () => {
    expect(
      renderInbox([
        buildAttentionItem({
          id: "interaction:approval:workspace-1:task-1:request-1",
          kind: "approval",
        }),
      ]),
    ).toContain("Dismiss");
  });

  test("omits the dismiss action when the need has no notification", () => {
    expect(
      renderInbox([buildAttentionItem({ notificationId: undefined, source: "live" })]),
    ).not.toContain("Dismiss");
  });

  test("omits the dismiss action when the question still has a live request", () => {
    // A live need merged with its notification keeps the live source and the
    // notification id. Resolving the notification does not retract the live
    // request, so the item would come straight back with the count unchanged.
    expect(
      renderInbox([buildAttentionItem({ source: "live" })]),
    ).not.toContain("Dismiss");
  });

  test("offers snooze on a blocking row as well as a review row", () => {
    expect(renderInbox([buildAttentionItem()])).toContain("Snooze");
    // Review rows stay folded until selected, so unfold this one to see it.
    expect(
      renderInbox([REVIEW_ITEM], { selectedAttentionId: REVIEW_ITEM.id }),
    ).toContain("Snooze");
  });

  test("offers a bulk clear only once something is worth a look", () => {
    expect(renderInbox([REVIEW_ITEM])).toContain("Clear all");
    expect(renderInbox([REVIEW_ITEM])).toContain("Clear the 1 item worth a look");
    // Nothing in the blocking rail may be cleared in bulk: an agent is waiting.
    expect(renderInbox([buildAttentionItem()])).not.toContain("Clear all");
  });

  test("accounts for snoozed rows and offers to restore them", () => {
    const markup = renderInbox([buildAttentionItem()], { snoozedCount: 3 });
    expect(markup).toContain("3 snoozed");
    expect(markup).toContain("Restore");
  });

  test("says nothing about snoozed rows when none are hidden", () => {
    expect(renderInbox([buildAttentionItem()])).not.toContain("snoozed");
  });
});
