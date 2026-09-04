import { describe, expect, test } from "bun:test";
import type { FleetAttentionItem } from "../src/lib/fleet/attention-projection";
import { FLEET_ATTENTION_PRIORITY } from "../src/lib/fleet/attention-projection";
import {
  buildCollapsedWorkspaceEntries,
  buildProjectSidebarAttentionAlert,
  buildSidebarWorkQueueEntries,
  buildWorkspaceArchiveDialogCopy,
  buildWorkspaceHoverPreview,
  buildWorkspaceProgressTaskItems,
  buildVisibleWorkspaceShortcutTargets,
  formatWorkQueueWorkspaceLabel,
  getWorkspaceHoverActionVisibilityClasses,
  getWorkspaceLeadingAttentionKind,
  getWorkspaceShortcutLabel,
  getWorkspaceRespondingCountVisibilityClasses,
  resolveWorkspaceProgressTaskLoaderVariant,
  summarizeWorkspaceTaskTitle,
  WORKSPACE_SHORTCUT_COUNT,
} from "../src/components/layout/ProjectWorkspaceSidebar.utils";

describe("getWorkspaceLeadingAttentionKind", () => {
  test("keeps completed results from replacing the workspace identity icon", () => {
    expect(getWorkspaceLeadingAttentionKind("result-ready")).toBeUndefined();
  });

  test("preserves actionable and failure attention states", () => {
    expect(getWorkspaceLeadingAttentionKind("user-input")).toBe("user-input");
    expect(getWorkspaceLeadingAttentionKind("approval")).toBe("approval");
    expect(getWorkspaceLeadingAttentionKind("run-failed")).toBe("run-failed");
    expect(getWorkspaceLeadingAttentionKind("pr-ready-to-merge")).toBe(
      "pr-ready-to-merge",
    );
  });
});

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

describe("buildSidebarWorkQueueEntries", () => {
  const baseProjects = [
    {
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaces: [
        { id: "ws-active", name: "active-ws", isDefault: true, branch: "main" },
        {
          id: "ws-attention",
          name: "attention-ws",
          isDefault: false,
          branch: "feature/a",
        },
        {
          id: "ws-idle",
          name: "idle-ws",
          isDefault: false,
          branch: "feature/idle",
        },
      ],
      activeWorkspaceId: "ws-attention",
      isCurrent: true,
    },
    {
      projectPath: "/tmp/project-b",
      projectName: "project-b",
      workspaces: [
        {
          id: "ws-b-recent",
          name: "recent-ws",
          isDefault: true,
          branch: "main",
        },
      ],
      activeWorkspaceId: "ws-b-recent",
      isCurrent: false,
    },
  ];

  test("ranks the current workspace first, then attention/error/running, then recency", () => {
    const entries = buildSidebarWorkQueueEntries({
      projects: baseProjects,
      recentProjectLastOpenedAtByPath: {
        "/tmp/project-a": "2026-07-01T00:00:00.000Z",
        "/tmp/project-b": "2026-07-05T00:00:00.000Z",
      },
      statusByWorkspaceId: {
        "ws-active": "idle",
        "ws-attention": "waiting-input",
        "ws-b-recent": "idle",
      },
      activeWorkspaceId: "ws-active",
    });

    expect(entries.map((entry) => entry.workspaceId)).toEqual([
      "ws-active",
      "ws-attention",
      "ws-b-recent",
      "ws-idle",
    ]);
    expect(entries[0]?.isActive).toBe(true);
    expect(entries[1]?.status).toBe("waiting-input");
  });

  test("returns every workspace so the queue view can navigate anywhere", () => {
    // The queue is a whole sidebar view, not a strip above the tree. If a quiet
    // workspace were filtered out the user could not reach it without leaving
    // the view, which is the one thing a navigation surface may not do.
    const entries = buildSidebarWorkQueueEntries({
      projects: baseProjects,
      recentProjectLastOpenedAtByPath: {},
      statusByWorkspaceId: {},
      activeWorkspaceId: "ws-active",
    });

    expect(entries.map((entry) => entry.workspaceId).sort()).toEqual([
      "ws-active",
      "ws-attention",
      "ws-b-recent",
      "ws-idle",
    ]);
  });

  test("orders cold workspaces with durable Fleet attention above quiet ones", () => {
    const entries = buildSidebarWorkQueueEntries({
      projects: baseProjects,
      recentProjectLastOpenedAtByPath: {},
      statusByWorkspaceId: {},
      attentionPriorityByWorkspaceId: {
        "ws-idle": 1,
        "ws-b-recent": 4,
      },
      activeWorkspaceId: "ws-active",
    });

    expect(entries.map((entry) => entry.workspaceId)).toEqual([
      "ws-active",
      "ws-idle",
      "ws-b-recent",
      "ws-attention",
    ]);
  });

  test("running and error workspaces outrank idle ones", () => {
    const entries = buildSidebarWorkQueueEntries({
      projects: baseProjects,
      recentProjectLastOpenedAtByPath: {},
      statusByWorkspaceId: {
        "ws-idle": "error",
        "ws-attention": "running",
      },
      activeWorkspaceId: "ws-active",
    });

    expect(entries.map((entry) => entry.workspaceId)).toEqual([
      "ws-active",
      "ws-idle",
      "ws-attention",
      "ws-b-recent",
    ]);
  });

  test("lists a workspace once even when two projects claim it", () => {
    const entries = buildSidebarWorkQueueEntries({
      projects: [
        baseProjects[0]!,
        {
          ...baseProjects[1]!,
          workspaces: [
            ...baseProjects[1]!.workspaces,
            { id: "ws-idle", name: "idle-ws", isDefault: false },
          ],
        },
      ],
      recentProjectLastOpenedAtByPath: {},
      statusByWorkspaceId: {},
      activeWorkspaceId: "ws-active",
    });

    expect(
      entries.filter((entry) => entry.workspaceId === "ws-idle"),
    ).toHaveLength(1);
  });
});

describe("formatWorkQueueWorkspaceLabel", () => {
  test("prefers the workspace label over its branch", () => {
    expect(
      formatWorkQueueWorkspaceLabel({
        name: "fleet ux",
        branch: "fix/fleet-ux-0811",
        isDefault: false,
      }),
    ).toBe("fleet ux");
  });

  test("falls back to the branch when the workspace has no label of its own", () => {
    expect(
      formatWorkQueueWorkspaceLabel({
        name: "Default Workspace",
        branch: "main",
        isDefault: true,
      }),
    ).toBe("main");
    expect(
      formatWorkQueueWorkspaceLabel({
        name: "   ",
        branch: "feat/queue",
        isDefault: false,
      }),
    ).toBe("feat/queue");
  });

  test("treats the fabricated default name as unlabelled even without the flag", () => {
    expect(
      formatWorkQueueWorkspaceLabel({
        name: "Default Workspace",
        branch: "release/1.2",
        isDefault: false,
      }),
    ).toBe("release/1.2");
  });

  test("keeps a readable identifier when neither label nor branch is known", () => {
    expect(formatWorkQueueWorkspaceLabel({ name: "", isDefault: true })).toBe(
      "Default",
    );
    expect(formatWorkQueueWorkspaceLabel({ name: "", isDefault: false })).toBe(
      "worktree",
    );
  });
});

describe("buildWorkspaceArchiveDialogCopy", () => {
  test("offers branch deletion for a Stave-managed worktree", () => {
    const copy = buildWorkspaceArchiveDialogCopy({
      workspaceName: "fix/archive",
      isLinkedWorktree: false,
    });

    expect(copy.canDeleteBranch).toBe(true);
    expect(copy.description).toBe(
      'Archive workspace "fix/archive"? Stave will remove the associated git worktree only when it is clean and will preserve local changes.',
    );
  });

  test("withholds branch deletion for an imported linked worktree", () => {
    const copy = buildWorkspaceArchiveDialogCopy({
      workspaceName: "imported",
      isLinkedWorktree: true,
    });

    expect(copy.canDeleteBranch).toBe(false);
    expect(copy.description).toBe(
      'Archive workspace "imported"? It is a linked worktree owned outside this project, so Stave only removes its shortcut — the worktree and its git branch stay untouched.',
    );
  });
});

describe("buildProjectSidebarAttentionAlert", () => {
  function buildAttentionItem(
    overrides: Partial<FleetAttentionItem>,
  ): FleetAttentionItem {
    return {
      id: overrides.id ?? "need-1",
      kind: overrides.kind ?? "user-input",
      priority:
        overrides.priority ??
        FLEET_ATTENTION_PRIORITY[overrides.kind ?? "user-input"],
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaceId: overrides.workspaceId ?? "ws-1",
      workspaceName: "ws-1",
      createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
      source: overrides.source ?? "live",
      ...overrides,
    } as FleetAttentionItem;
  }

  test("returns no alert when the project has no needs at all", () => {
    expect(
      buildProjectSidebarAttentionAlert({
        workspaces: [{ id: "ws-1" }, { id: "ws-2" }],
        attentionItemsByWorkspaceId: {},
      }),
    ).toBeNull();
  });

  test("raises an answer-needed alert when the AI is waiting on user input", () => {
    const alert = buildProjectSidebarAttentionAlert({
      workspaces: [{ id: "ws-1" }],
      attentionItemsByWorkspaceId: {
        "ws-1": [buildAttentionItem({ kind: "user-input" })],
      },
    });

    expect(alert?.kind).toBe("user-input");
    expect(alert?.attentionItemCount).toBe(1);
    expect(alert?.workspaceCount).toBe(1);
    expect(alert?.label).toBe("1 item needs attention: answer needed");
  });

  test("raises an approval alert when the AI is waiting on a tool approval", () => {
    const alert = buildProjectSidebarAttentionAlert({
      workspaces: [{ id: "ws-1" }],
      attentionItemsByWorkspaceId: {
        "ws-1": [buildAttentionItem({ kind: "approval" })],
      },
    });

    expect(alert?.kind).toBe("approval");
    expect(alert?.label).toBe("1 item needs attention: approval needed");
  });

  test("marks a finished-but-unconfirmed result as a review-tier alert", () => {
    const alert = buildProjectSidebarAttentionAlert({
      workspaces: [{ id: "ws-1" }],
      attentionItemsByWorkspaceId: {
        "ws-1": [buildAttentionItem({ kind: "result-ready" })],
      },
    });

    expect(alert?.tier).toBe("review");
    expect(alert?.kind).toBe("result-ready");
    expect(alert?.attentionItemCount).toBe(1);
    expect(alert?.label).toBe("1 item to review: result ready");
  });

  test("labels several review needs without claiming they need attention", () => {
    const alert = buildProjectSidebarAttentionAlert({
      workspaces: [{ id: "ws-1" }, { id: "ws-2" }],
      attentionItemsByWorkspaceId: {
        "ws-1": [buildAttentionItem({ kind: "result-ready" })],
        "ws-2": [
          buildAttentionItem({
            id: "need-merge",
            kind: "pr-ready-to-merge",
            workspaceId: "ws-2",
          }),
        ],
      },
    });

    expect(alert?.tier).toBe("review");
    expect(alert?.attentionItemCount).toBe(2);
    expect(alert?.label).toBe(
      "2 items to review across 2 workspaces, latest: result ready",
    );
  });

  test("keeps a blocking need visible even when review needs sit alongside it", () => {
    const alert = buildProjectSidebarAttentionAlert({
      workspaces: [{ id: "ws-1" }],
      attentionItemsByWorkspaceId: {
        "ws-1": [
          buildAttentionItem({ id: "need-review", kind: "result-ready" }),
          buildAttentionItem({ id: "need-blocking", kind: "approval" }),
        ],
      },
    });

    expect(alert?.kind).toBe("approval");
    expect(alert?.tier).toBe("blocking");
    expect(alert?.attentionItemCount).toBe(1);
  });

  test("excludes review needs from the blocking count so the badge stays truthful", () => {
    const alert = buildProjectSidebarAttentionAlert({
      workspaces: [{ id: "ws-1" }, { id: "ws-2" }],
      attentionItemsByWorkspaceId: {
        "ws-1": [
          buildAttentionItem({ id: "need-blocking", kind: "approval" }),
          buildAttentionItem({ id: "need-review-a", kind: "result-ready" }),
        ],
        "ws-2": [
          buildAttentionItem({
            id: "need-review-b",
            kind: "result-ready",
            workspaceId: "ws-2",
          }),
        ],
      },
    });

    expect(alert?.tier).toBe("blocking");
    expect(alert?.attentionItemCount).toBe(1);
    // The review-only workspace must not inflate the blocking scope either.
    expect(alert?.workspaceCount).toBe(1);
    expect(alert?.label).toBe("1 item needs attention: approval needed");
  });

  test("tags every blocking alert with the blocking tier", () => {
    const alert = buildProjectSidebarAttentionAlert({
      workspaces: [{ id: "ws-1" }],
      attentionItemsByWorkspaceId: {
        "ws-1": [buildAttentionItem({ kind: "user-input" })],
      },
    });

    expect(alert?.tier).toBe("blocking");
  });

  test("surfaces the most urgent need when a project blocks in several ways", () => {
    const alert = buildProjectSidebarAttentionAlert({
      workspaces: [{ id: "ws-1" }, { id: "ws-2" }],
      attentionItemsByWorkspaceId: {
        "ws-1": [buildAttentionItem({ id: "need-failed", kind: "run-failed" })],
        "ws-2": [
          buildAttentionItem({
            id: "need-input",
            kind: "user-input",
            workspaceId: "ws-2",
          }),
        ],
      },
    });

    expect(alert?.kind).toBe("user-input");
    expect(alert?.attentionItemCount).toBe(2);
    expect(alert?.workspaceCount).toBe(2);
    expect(alert?.label).toBe(
      "2 items need attention across 2 workspaces, most urgent: answer needed",
    );
  });

  test("breaks priority ties with the older need so the label stays stable", () => {
    const alert = buildProjectSidebarAttentionAlert({
      workspaces: [{ id: "ws-1" }],
      attentionItemsByWorkspaceId: {
        "ws-1": [
          buildAttentionItem({
            id: "need-newer",
            kind: "pr-checks-failed",
            createdAt: "2026-02-01T00:00:00.000Z",
          }),
          buildAttentionItem({
            id: "need-older",
            kind: "pr-merge-conflict",
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
        ],
      },
    });

    expect(alert?.kind).toBe("pr-merge-conflict");
  });

  test("counts only needs belonging to the project's own workspaces", () => {
    const alert = buildProjectSidebarAttentionAlert({
      workspaces: [{ id: "ws-1" }],
      attentionItemsByWorkspaceId: {
        "ws-1": [buildAttentionItem({ kind: "approval" })],
        "ws-other": [
          buildAttentionItem({
            id: "need-other",
            kind: "user-input",
            workspaceId: "ws-other",
          }),
        ],
      },
    });

    expect(alert?.kind).toBe("approval");
    expect(alert?.attentionItemCount).toBe(1);
    expect(alert?.workspaceCount).toBe(1);
  });
});

describe("workspace progress task tree", () => {
  test("summarizes long titles on a word boundary", () => {
    expect(summarizeWorkspaceTaskTitle("  Fix the flaky sidebar test  ")).toBe(
      "Fix the flaky sidebar test",
    );
    expect(summarizeWorkspaceTaskTitle("")).toBe("Untitled Task");
    expect(
      summarizeWorkspaceTaskTitle(
        "Rewrite the provider logo fallback so idle workspaces keep a readable mark",
      ),
    ).toBe("Rewrite the provider logo fallback so…");
  });

  test("maps in-flight statuses to meaning-led loaders", () => {
    expect(resolveWorkspaceProgressTaskLoaderVariant("running")).toBe("pulse");
    expect(resolveWorkspaceProgressTaskLoaderVariant("waiting-input")).toBe(
      "handoff",
    );
    expect(resolveWorkspaceProgressTaskLoaderVariant("waiting-approval")).toBe(
      "handoff",
    );
    expect(resolveWorkspaceProgressTaskLoaderVariant("error")).toBeNull();
    expect(resolveWorkspaceProgressTaskLoaderVariant("idle")).toBeNull();
  });

  test("hides the tree when no open task is responding", () => {
    expect(
      buildWorkspaceProgressTaskItems({
        tasks: [
          {
            id: "task-idle",
            title: "Idle task",
            provider: "claude-code",
            updatedAt: "2026-09-04T01:00:00.000Z",
            archivedAt: null,
          },
        ],
      }),
    ).toEqual([]);
  });

  test("lists open tasks under a responding workspace with provider and status", () => {
    const items = buildWorkspaceProgressTaskItems({
      tasks: [
        {
          id: "task-running",
          title: "Stream the workspace tree",
          provider: "claude-code",
          updatedAt: "2026-09-04T02:00:00.000Z",
          archivedAt: null,
        },
        {
          id: "task-idle",
          title: "Later cleanup",
          provider: "codex",
          updatedAt: "2026-09-04T01:00:00.000Z",
          archivedAt: null,
        },
        {
          id: "task-archived",
          title: "Old work",
          provider: "claude-code",
          updatedAt: "2026-09-04T00:00:00.000Z",
          archivedAt: "2026-09-04T00:30:00.000Z",
        },
      ],
      activeTurnIdsByTask: {
        "task-running": "turn-1",
      },
      openTaskTabIds: ["task-running", "task-idle"],
    });

    expect(items).toEqual([
      {
        taskId: "task-running",
        title: "Stream the workspace tree",
        status: "running",
        providerId: "claude-code",
      },
      {
        taskId: "task-idle",
        title: "Later cleanup",
        status: "idle",
        providerId: "codex",
      },
    ]);
  });

  test("keeps a closed tab visible when its turn is still in flight", () => {
    const items = buildWorkspaceProgressTaskItems({
      tasks: [
        {
          id: "task-background",
          title: "Background run",
          provider: "codex",
          updatedAt: "2026-09-04T03:00:00.000Z",
          archivedAt: null,
        },
      ],
      activeTurnIdsByTask: {
        "task-background": "turn-bg",
      },
      openTaskTabIds: [],
    });

    expect(items).toEqual([
      {
        taskId: "task-background",
        title: "Background run",
        status: "running",
        providerId: "codex",
      },
    ]);
  });
});
