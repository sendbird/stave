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

function renderInbox(items: FleetAttentionItem[]) {
  return renderToStaticMarkup(
    createElement(FleetAttentionInbox, {
      items,
      selectedAttentionId: null,
      busyAttentionId: null,
      onOpen: () => {},
      onOpenTask: () => {},
      onMarkRead: () => {},
      onDismiss: () => {},
      onOpenPr: () => {},
    }),
  );
}

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
});
