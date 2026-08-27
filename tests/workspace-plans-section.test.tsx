import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { WorkspacePlansSection } from "@/components/layout/WorkspacePlansSection";

const BASE_PROPS = {
  embedded: true,
  refreshNonce: 0,
  taskId: "task-1",
  onOpenFile: async () => {},
};

describe("WorkspacePlansSection", () => {
  test("uses the workspace path as the saved-plan state boundary", () => {
    const sourceWorkspace = WorkspacePlansSection({
      ...BASE_PROPS,
      workspacePath: "/tmp/workspaces/source",
    }) as ReactElement;
    const targetWorkspace = WorkspacePlansSection({
      ...BASE_PROPS,
      workspacePath: "/tmp/workspaces/target",
    }) as ReactElement;

    expect(sourceWorkspace.key).toBe("/tmp/workspaces/source");
    expect(targetWorkspace.key).toBe("/tmp/workspaces/target");
    expect(targetWorkspace.key).not.toBe(sourceWorkspace.key);
  });
});
