import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FleetNeedsInbox } from "@/components/layout/FleetNeedsInbox";
import type { FleetNeedItem } from "@/lib/fleet/attention-projection";

function buildNeed(overrides: Partial<FleetNeedItem> = {}): FleetNeedItem {
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

function renderInbox(items: FleetNeedItem[]) {
  return renderToStaticMarkup(
    createElement(FleetNeedsInbox, {
      items,
      selectedNeedId: null,
      busyNeedId: null,
      onOpen: () => {},
      onResolveApproval: () => {},
      onMarkRead: () => {},
      onDismiss: () => {},
      onOpenPr: () => {},
    }),
  );
}

describe("FleetNeedsInbox", () => {
  test("offers a dismiss action for notification-backed questions", () => {
    expect(renderInbox([buildNeed()])).toContain("Dismiss");
  });

  test("omits the dismiss action when the need has no notification", () => {
    expect(
      renderInbox([buildNeed({ notificationId: undefined, source: "live" })]),
    ).not.toContain("Dismiss");
  });
});
