import { describe, expect, test } from "bun:test";
import {
  buildCollapsedWorkspaceEntries,
  buildWorkspaceHoverPreview,
  buildVisibleWorkspaceShortcutTargets,
  getWorkspaceHoverActionVisibilityClasses,
  getWorkspaceShortcutLabel,
  getWorkspaceRespondingCountVisibilityClasses,
  WORKSPACE_SHORTCUT_COUNT,
} from "../src/components/layout/ProjectWorkspaceSidebar.utils";

describe("buildCollapsedWorkspaceEntries", () => {
  test("marks the first workspace of each later project for collapsed separators", () => {
    const entries = buildCollapsedWorkspaceEntries({
      activeWorkspaceId: "ws-3",
      projects: [
        {
          projectPath: "/tmp/project-a",
          projectName: "project-a",
          workspaces: [
            {
              id: "ws-1",
              name: "Default Workspace",
              isDefault: true,
              branch: "main",
            },
            {
              id: "ws-2",
              name: "feature/a",
              isDefault: false,
              branch: "feature/a",
            },
          ],
          activeWorkspaceId: "ws-2",
          isCurrent: false,
        },
        {
          projectPath: "/tmp/project-b",
          projectName: "project-b",
          workspaces: [
            {
              id: "ws-3",
              name: "Default Workspace",
              isDefault: true,
              branch: "main",
            },
          ],
          activeWorkspaceId: "ws-3",
          isCurrent: true,
        },
      ],
    });

    expect(
      entries.map((entry) => ({
        workspaceId: entry.workspaceId,
        startsProjectGroup: entry.startsProjectGroup,
        isActive: entry.isActive,
      })),
    ).toEqual([
      { workspaceId: "ws-1", startsProjectGroup: false, isActive: false },
      { workspaceId: "ws-2", startsProjectGroup: false, isActive: false },
      { workspaceId: "ws-3", startsProjectGroup: true, isActive: true },
    ]);
  });

  test("does not create a separator before the first rendered workspace group", () => {
    const entries = buildCollapsedWorkspaceEntries({
      activeWorkspaceId: "ws-2",
      projects: [
        {
          projectPath: "/tmp/empty-project",
          projectName: "empty-project",
          workspaces: [],
          activeWorkspaceId: "",
          isCurrent: false,
        },
        {
          projectPath: "/tmp/project-b",
          projectName: "project-b",
          workspaces: [
            {
              id: "ws-2",
              name: "Default Workspace",
              isDefault: true,
              branch: "main",
            },
          ],
          activeWorkspaceId: "ws-2",
          isCurrent: true,
        },
      ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.startsProjectGroup).toBeFalse();
  });
});

describe("buildWorkspaceHoverPreview", () => {
  test("excludes archived tasks from the hover summary", () => {
    const preview = buildWorkspaceHoverPreview({
      tasks: [
        {
          id: "task-active",
          title: "Active task",
          updatedAt: "2026-04-07T08:00:00.000Z",
          archivedAt: null,
        },
        {
          id: "task-archived",
          title: "Archived task",
          updatedAt: "2026-04-07T09:00:00.000Z",
          archivedAt: "2026-04-07T09:30:00.000Z",
        },
      ],
      messageCountByTask: {
        "task-active": 3,
        "task-archived": 99,
      },
    });

    expect(preview).toMatchObject({
      isEmpty: false,
      taskCount: 1,
      messageCount: 3,
      taskTitles: ["Active task"],
      moreTaskCount: 0,
    });
  });

  test("orders preview titles by latest task activity", () => {
    const preview = buildWorkspaceHoverPreview({
      tasks: [
        {
          id: "task-older",
          title: "Older task",
          updatedAt: "2026-04-07T08:00:00.000Z",
          archivedAt: null,
        },
        {
          id: "task-newer",
          title: "Newer task",
          updatedAt: "2026-04-07T09:00:00.000Z",
          archivedAt: null,
        },
      ],
    });

    expect(preview.taskTitles).toEqual(["Newer task", "Older task"]);
  });

  test("shows at most two task titles and reports overflow count", () => {
    const preview = buildWorkspaceHoverPreview({
      tasks: [
        {
          id: "task-1",
          title: "Task one",
          updatedAt: "2026-04-07T10:00:00.000Z",
          archivedAt: null,
        },
        {
          id: "task-2",
          title: "Task two",
          updatedAt: "2026-04-07T09:00:00.000Z",
          archivedAt: null,
        },
        {
          id: "task-3",
          title: "Task three",
          updatedAt: "2026-04-07T08:00:00.000Z",
          archivedAt: null,
        },
      ],
    });

    expect(preview.taskTitles).toEqual(["Task one", "Task two"]);
    expect(preview.moreTaskCount).toBe(1);
  });

  test("counts running tasks from active turns", () => {
    const preview = buildWorkspaceHoverPreview({
      tasks: [
        {
          id: "task-1",
          title: "Task one",
          updatedAt: "2026-04-07T10:00:00.000Z",
          archivedAt: null,
        },
        {
          id: "task-2",
          title: "Task two",
          updatedAt: "2026-04-07T09:00:00.000Z",
          archivedAt: null,
        },
      ],
      activeTurnIdsByTask: {
        "task-1": "turn-1",
      },
    });

    expect(preview.runningTaskCount).toBe(1);
  });

  test("falls back to an empty summary when there are no visible tasks", () => {
    const preview = buildWorkspaceHoverPreview({
      tasks: [
        {
          id: "task-archived",
          title: "Archived task",
          updatedAt: "2026-04-07T09:00:00.000Z",
          archivedAt: "2026-04-07T09:30:00.000Z",
        },
      ],
    });

    expect(preview).toMatchObject({
      isEmpty: true,
      taskCount: 0,
      messageCount: 0,
      runningTaskCount: 0,
      taskTitles: [],
      moreTaskCount: 0,
    });
  });
});

describe("workspace hover action visibility", () => {
  test("reveals hover actions on hover and keyboard focus-visible, not generic focus-within", () => {
    const className = getWorkspaceHoverActionVisibilityClasses({
      isClosing: false,
    });

    expect(className).toContain("group-hover/workspace-row:opacity-100");
    expect(className).toContain(
      "group-has-[:focus-visible]/workspace-row:opacity-100",
    );
    expect(className).not.toContain("group-focus-within");
  });

  test("keeps hover actions visible while closing", () => {
    expect(
      getWorkspaceHoverActionVisibilityClasses({
        isClosing: true,
      }),
    ).toBe("pointer-events-auto opacity-100");
  });
});

describe("workspace responding count visibility", () => {
  test("hides the responding count with the same reveal rules when hover actions exist", () => {
    const className = getWorkspaceRespondingCountVisibilityClasses({
      hasHoverActions: true,
      isClosing: false,
    });

    expect(className).toContain("group-hover/workspace-row:opacity-0");
    expect(className).toContain(
      "group-has-[:focus-visible]/workspace-row:opacity-0",
    );
  });

  test("keeps the responding count visible when no hover actions exist", () => {
    expect(
      getWorkspaceRespondingCountVisibilityClasses({
        hasHoverActions: false,
        isClosing: false,
      }),
    ).toBe("");
  });

  test("keeps the responding count hidden while closing", () => {
    expect(
      getWorkspaceRespondingCountVisibilityClasses({
        hasHoverActions: true,
        isClosing: true,
      }),
    ).toBe("opacity-0");
  });
});

describe("workspace shortcut targets", () => {
  const projects = [
    {
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaces: [
        {
          id: "ws-1",
          name: "Default Workspace",
          isDefault: true,
          branch: "main",
        },
        {
          id: "ws-2",
          name: "feature/a",
          isDefault: false,
          branch: "feature/a",
        },
      ],
      activeWorkspaceId: "ws-1",
      isCurrent: true,
    },
    {
      projectPath: "/tmp/project-b",
      projectName: "project-b",
      workspaces: [
        {
          id: "ws-3",
          name: "Default Workspace",
          isDefault: true,
          branch: "main",
        },
        {
          id: "ws-4",
          name: "feature/b",
          isDefault: false,
          branch: "feature/b",
        },
      ],
      activeWorkspaceId: "ws-3",
      isCurrent: false,
    },
  ] as const;

  test("uses only expanded and visible workspace rows for shortcut order", () => {
    const targets = buildVisibleWorkspaceShortcutTargets({
      collapsed: false,
      collapsedByProjectPath: {
        "/tmp/project-a": false,
        "/tmp/project-b": true,
      },
      projects: [...projects],
    });

    expect(targets).toEqual([
      { projectPath: "/tmp/project-a", workspaceId: "ws-1" },
      { projectPath: "/tmp/project-a", workspaceId: "ws-2" },
    ]);
  });

  test("uses the collapsed rail order when the sidebar is collapsed", () => {
    const targets = buildVisibleWorkspaceShortcutTargets({
      collapsed: true,
      collapsedByProjectPath: {
        "/tmp/project-a": true,
        "/tmp/project-b": true,
      },
      projects: [...projects],
    });

    expect(targets).toEqual([
      { projectPath: "/tmp/project-a", workspaceId: "ws-1" },
      { projectPath: "/tmp/project-a", workspaceId: "ws-2" },
      { projectPath: "/tmp/project-b", workspaceId: "ws-3" },
      { projectPath: "/tmp/project-b", workspaceId: "ws-4" },
    ]);
  });

  test("limits workspace shortcut targets and labels to one through nine", () => {
    const targets = buildVisibleWorkspaceShortcutTargets({
      collapsed: true,
      collapsedByProjectPath: {},
      projects: [
        {
          projectPath: "/tmp/project-a",
          projectName: "project-a",
          workspaces: Array.from({ length: 12 }, (_, index) => ({
            id: `ws-${index + 1}`,
            name: `workspace-${index + 1}`,
            isDefault: index === 0,
            branch: `branch-${index + 1}`,
          })),
          activeWorkspaceId: "ws-1",
          isCurrent: true,
        },
      ],
    });

    expect(targets).toHaveLength(WORKSPACE_SHORTCUT_COUNT);
    expect(getWorkspaceShortcutLabel(0)).toBe("1");
    expect(getWorkspaceShortcutLabel(WORKSPACE_SHORTCUT_COUNT - 1)).toBe("9");
    expect(getWorkspaceShortcutLabel(WORKSPACE_SHORTCUT_COUNT)).toBeNull();
  });
});
