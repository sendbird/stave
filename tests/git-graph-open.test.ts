import { describe, expect, test } from "bun:test";
import { resolveOpenableGitGraphWorkspaceId } from "@/store/app-store-editor-actions";

describe("resolveOpenableGitGraphWorkspaceId", () => {
  test("returns the active workspace when its path is available", () => {
    expect(
      resolveOpenableGitGraphWorkspaceId({
        activeWorkspaceId: "workspace-1",
        projectPath: "/tmp/project",
        workspaces: [{ id: "workspace-1" }],
        workspacePathById: {
          "workspace-1": "/tmp/project/.stave/workspaces/workspace-1",
        },
      }),
    ).toBe("workspace-1");
  });

  test("rejects an empty or stale active workspace", () => {
    const context = {
      projectPath: "/tmp/project",
      workspaces: [{ id: "workspace-1" }],
      workspacePathById: {
        "workspace-1": "/tmp/project/.stave/workspaces/workspace-1",
      },
    };

    expect(
      resolveOpenableGitGraphWorkspaceId({
        ...context,
        activeWorkspaceId: "",
      }),
    ).toBeNull();
    expect(
      resolveOpenableGitGraphWorkspaceId({
        ...context,
        activeWorkspaceId: "missing-workspace",
      }),
    ).toBeNull();
  });

  test("rejects an active workspace without a usable path", () => {
    expect(
      resolveOpenableGitGraphWorkspaceId({
        activeWorkspaceId: "workspace-1",
        projectPath: null,
        workspaces: [{ id: "workspace-1" }],
        workspacePathById: {},
      }),
    ).toBeNull();
  });
});
