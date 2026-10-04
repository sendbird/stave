import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorkspacePlanFileWriter, isValidPlanFileName } from "../electron/host-service/local-mcp-plan-files";
import { buildCodexStaveToolApprovalOverrides } from "../electron/providers/codex-app-server-config-overrides";
import { isPromptFreeStaveLocalMcpTool } from "../electron/providers/stave-local-mcp-approval";

const roots: string[] = [];
function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), "stave-plan-files-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("stave_write_plan_file", () => {
  test("writes only into the workspace plan store and reports replacement", async () => {
    const root = workspace();
    const write = createWorkspacePlanFileWriter({ resolveWorkspacePath: async (id) => (id === "ws-1" ? root : null) });
    const first = await write({ workspaceId: "ws-1", fileName: "33a56855_2026-10-04T09-30-00.md", content: "# Plan\n" });
    expect(first).toMatchObject({ filePath: ".stave/context/plans/33a56855_2026-10-04T09-30-00.md", replaced: false });
    expect(readFileSync(path.join(root, first.filePath), "utf8")).toBe("# Plan\n");
    const second = await write({ workspaceId: "ws-1", fileName: "33a56855_2026-10-04T09-30-00.md", content: "# Plan v2\n" });
    expect(second.replaced).toBe(true);
    await expect(write({ workspaceId: "ws-x", fileName: "a.md", content: "x" })).rejects.toThrow("Workspace not found");
  });

  test("refuses names that leave the plan store", async () => {
    for (const name of ["../escape.md", "nested/plan.md", ".hidden.md", "plan.txt", "a..b.md", "/abs.md"]) {
      expect([name, isValidPlanFileName(name)]).toEqual([name, false]);
    }
    expect(isValidPlanFileName("33a56855_2026-10-04T09-30-00.md")).toBe(true);
  });

  test("refuses a symlinked plan directory or target", async () => {
    const root = workspace();
    const outside = workspace();
    mkdirSync(path.join(root, ".stave/context"), { recursive: true });
    symlinkSync(outside, path.join(root, ".stave/context/plans"));
    const write = createWorkspacePlanFileWriter({ resolveWorkspacePath: async () => root });
    await expect(write({ workspaceId: "ws", fileName: "p.md", content: "x" })).rejects.toThrow("outside the workspace");

    const other = workspace();
    mkdirSync(path.join(other, ".stave/context/plans"), { recursive: true });
    writeFileSync(path.join(outside, "target.md"), "keep");
    symlinkSync(path.join(outside, "target.md"), path.join(other, ".stave/context/plans/p.md"));
    const writeOther = createWorkspacePlanFileWriter({ resolveWorkspacePath: async () => other });
    await expect(writeOther({ workspaceId: "ws", fileName: "p.md", content: "x" })).rejects.toThrow("regular file");
    expect(readFileSync(path.join(outside, "target.md"), "utf8")).toBe("keep");
  });
});

describe("read-only posture keeps Stave records reachable", () => {
  test("Codex pre-approves recording tools, never destructive or spawning ones", () => {
    const overrides = buildCodexStaveToolApprovalOverrides();
    const key = (tool: string) => `mcp_servers.stave-local.tools.${tool}.approval_mode`;
    for (const tool of ["stave_report_stage", "stave_block_stage", "stave_append_workspace_notes", "stave_write_plan_file", "stave_get_workspace_information"])
      expect(overrides[key(tool)]).toBe("approve");
    for (const tool of ["stave_clear_workspace_notes", "stave_run_task", "stave_delegate_task", "stave_respond_user_input", "stave_remember"])
      expect(overrides[key(tool)]).toBeUndefined();
  });

  test("Claude dontAsk runs recording tools and still denies the rest", () => {
    expect(isPromptFreeStaveLocalMcpTool("mcp__stave-local-mcp__stave_report_stage", "dontAsk")).toBe(true);
    expect(isPromptFreeStaveLocalMcpTool("mcp__stave-local-mcp__stave_write_plan_file", "dontAsk")).toBe(true);
    expect(isPromptFreeStaveLocalMcpTool("mcp__stave-local-mcp__stave_clear_workspace_notes", "dontAsk")).toBe(false);
    expect(isPromptFreeStaveLocalMcpTool("mcp__stave-local-mcp__stave_run_task", "dontAsk")).toBe(false);
  });
});
