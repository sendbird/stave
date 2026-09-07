import type { AppNotification } from "@/lib/notifications/notification.types";
import type { TrackerTaskListItem } from "@/lib/tracker-tasks/types";

export const notifications: AppNotification[] = Array.from(
  { length: 335 },
  (_, i) => ({
    id: `preview-notification-${i}`,
    kind: "task.turn_completed",
    title: "Review complete",
    body: "The requested changes are ready for review.",
    projectPath: null,
    projectName: "Preview",
    workspaceId: null,
    workspaceName: "Design review",
    taskId: null,
    taskTitle: "Review changes",
    turnId: null,
    providerId: "claude-code",
    action: null,
    payload: {},
    createdAt: new Date().toISOString(),
    readAt: new Date().toISOString(),
  }),
);

export const tickets: TrackerTaskListItem[] = [
  {
    title:
      "Preserve a long task title when the board is embedded beside a detail panel",
    category: "todo",
    priority: "high",
  },
  {
    title: "Align the model selector and notification tabs",
    category: "in_progress",
    priority: "medium",
  },
  {
    title: "Check the finished changes in both themes",
    category: "in_review",
    priority: "low",
  },
].map((row, i) => ({
  task: {
    source: "jira",
    ref: `PREVIEW-${i + 1}`,
    key: `PREVIEW-${i + 1}`,
    title: row.title,
    url: `https://example.invalid/tasks/${i + 1}`,
    status: {
      raw: row.category,
      category: row.category as "todo" | "in_progress" | "in_review",
    },
    priority: {
      raw: row.priority,
      level: row.priority as "high" | "medium" | "low",
    },
    assignee: { id: "preview-person", name: "Mara Ito" },
    labels: [
      { name: "Interface" },
      { name: "Accessibility" },
      { name: "Quality" },
    ],
    dueDate: "2026-09-07",
    effort: null,
    project: null,
    team: null,
    parentKey: null,
    subtasks: null,
    issueType: null,
    links: [],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-07T00:00:00Z",
    closedAt: null,
  },
  staveLinks: [],
}));
