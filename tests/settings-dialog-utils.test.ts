import { describe, expect, test } from "bun:test";
import {
  resolveSettingsProjectSelection,
  shouldCloseSettingsDialogFromMouseDown,
} from "@/components/layout/settings-dialog.utils";
import type { RecentProjectState } from "@/store/project.utils";

function createProject(args: {
  projectPath: string;
  projectName: string;
}): RecentProjectState {
  return {
    projectPath: args.projectPath,
    projectName: args.projectName,
    lastOpenedAt: "2026-04-06T00:00:00.000Z",
    defaultBranch: "main",
    workspaces: [],
    activeWorkspaceId: "",
    workspaceBranchById: {},
    workspacePathById: {},
    workspaceDefaultById: {},
  };
}

describe("resolveSettingsProjectSelection", () => {
  const projects = [
    createProject({
      projectPath: "/tmp/project-a",
      projectName: "project-a",
    }),
    createProject({
      projectPath: "/tmp/project-b",
      projectName: "project-b",
    }),
  ];

  test("returns null when no projects are registered", () => {
    expect(resolveSettingsProjectSelection({
      projects: [],
      selectedProjectPath: null,
      highlightedProjectPath: "/tmp/project-a",
      currentProjectPath: "/tmp/project-a",
    })).toBeNull();
  });

  test("keeps the user's current selection instead of restoring the initial highlight", () => {
    expect(resolveSettingsProjectSelection({
      projects,
      selectedProjectPath: "/tmp/project-b",
      highlightedProjectPath: "/tmp/project-a",
      currentProjectPath: "/tmp/project-a",
      allowHighlightedOverride: false,
    })).toBe("/tmp/project-b");
  });

  test("uses the highlighted project when there is no valid selection yet", () => {
    expect(resolveSettingsProjectSelection({
      projects,
      selectedProjectPath: null,
      highlightedProjectPath: "/tmp/project-b",
      currentProjectPath: "/tmp/project-a",
      allowHighlightedOverride: true,
    })).toBe("/tmp/project-b");
  });

  test("falls back to the current project after a stale selection", () => {
    expect(resolveSettingsProjectSelection({
      projects,
      selectedProjectPath: "/tmp/removed-project",
      highlightedProjectPath: "/tmp/project-a",
      currentProjectPath: "/tmp/project-b",
      allowHighlightedOverride: false,
    })).toBe("/tmp/project-b");
  });

  test("falls back to the first registered project when no other target matches", () => {
    expect(resolveSettingsProjectSelection({
      projects,
      selectedProjectPath: "/tmp/removed-project",
      highlightedProjectPath: "/tmp/missing-highlight",
      currentProjectPath: "/tmp/missing-current",
      allowHighlightedOverride: false,
    })).toBe("/tmp/project-a");
  });
});

describe("shouldCloseSettingsDialogFromMouseDown", () => {
  test("closes when the backdrop itself receives the mouse event", () => {
    const backdrop = { id: "settings-backdrop" };

    expect(shouldCloseSettingsDialogFromMouseDown({
      target: backdrop,
      currentTarget: backdrop,
    })).toBe(true);
  });

  test("stays open for portal interactions such as Select content", () => {
    const backdrop = { id: "settings-backdrop" };
    const portaledSelectItem = { id: "select-item" };

    expect(shouldCloseSettingsDialogFromMouseDown({
      target: portaledSelectItem,
      currentTarget: backdrop,
    })).toBe(false);
  });
});
