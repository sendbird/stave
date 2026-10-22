import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { listWorkspaceDocumentFilePaths, WorkspacePlansSection } from "@/components/layout/WorkspacePlansSection";

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

  test("a documents folder the OS will not let Stave read is a failed read, not an empty list", async () => {
    const listing = (current: Record<string, unknown>) => {
      (globalThis as { window: unknown }).window = {
        api: { fs: { listDirectory: async ({ directoryPath }: { directoryPath: string }) =>
          directoryPath === ".stave/context/plans" ? current : { ok: false, entries: [], missing: true } } },
      };
      return listWorkspaceDocumentFilePaths("/tmp/workspaces/source");
    };
    await expect(listing({ ok: true, entries: [{ name: "a.md", path: ".stave/context/plans/a.md", type: "file" }] }))
      .resolves.toEqual({ current: [".stave/context/plans/a.md"], legacy: [] });
    await expect(listing({ ok: true, entries: [], unreadable: true })).rejects.toThrow();
  });
});
