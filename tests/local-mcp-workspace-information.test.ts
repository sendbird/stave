import { describe, expect, test } from "bun:test";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  createLocalMcpWorkspaceInformation,
  type WorkspaceInformationMutationResult,
} from "../electron/host-service/local-mcp-workspace-information";

function createHarness() {
  const state = new Map<string, WorkspaceInformationMutationResult["workspaceInformation"]>();
  const calls: string[] = [];
  let failure: Error | null = null;
  const api = createLocalMcpWorkspaceInformation({
    getWorkspaceInformation: async ({ workspaceId }) => {
      calls.push(`get:${workspaceId}`);
      return {
        workspaceId,
        workspaceInformation: state.get(workspaceId) ?? createEmptyWorkspaceInformation(),
      };
    },
    updateWorkspaceInformationState: async ({ workspaceId, updater }) => {
      calls.push(`update:${workspaceId}`);
      const current = state.get(workspaceId) ?? createEmptyWorkspaceInformation();
      const next = updater(current);
      if (failure) throw failure;
      state.set(workspaceId, next);
      return { workspaceId, workspaceInformation: next };
    },
  });
  return { api, calls, state, failWith: (error: Error | null) => { failure = error; } };
}

describe("local MCP workspace Information owner", () => {
  test("reads current state per call and preserves sequential mutation results", async () => {
    const { api, calls, state } = createHarness();
    await api.replaceWorkspaceNotes({ workspaceId: "alpha", notes: "One" });
    const appended = await api.appendWorkspaceNotes({ workspaceId: "alpha", text: " Two " });
    const other = await api.appendWorkspaceNotes({ workspaceId: "beta", text: "Other" });

    expect(appended.workspaceInformation.notes).toBe("One\nTwo");
    expect(other.workspaceInformation.notes).toBe("Other");
    expect((await api.getWorkspaceInformation({ workspaceId: "alpha" })).workspaceInformation.notes).toBe("One\nTwo");
    expect(state.get("beta")?.notes).toBe("Other");
    expect(calls).toEqual([
      "update:alpha",
      "update:alpha",
      "update:beta",
      "get:alpha",
    ]);
  });

  test("deduplicates a resource registration and keeps its existing id", async () => {
    const { api, state } = createHarness();
    const first = await api.addWorkspaceJiraIssue({
      workspaceId: "alpha",
      url: "https://acme.atlassian.net/browse/ABC-123",
    });
    const second = await api.addWorkspaceJiraIssue({
      workspaceId: "alpha",
      url: "https://acme.atlassian.net/browse/ABC-123?focusedCommentId=1",
      status: "In Progress",
    });
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.added.id).toBe(first.added.id);
    expect(state.get("alpha")?.jiraIssues).toHaveLength(1);
    expect(state.get("alpha")?.jiraIssues[0]?.status).toBe("In Progress");
  });

  test("invalid input and updater rejection propagate without persisting", async () => {
    const { api, calls, state, failWith } = createHarness();
    await expect(api.appendWorkspaceNotes({ workspaceId: "alpha", text: "  " }))
      .rejects.toThrow("Workspace notes append text is required.");
    await expect(api.addWorkspaceResource({ workspaceId: "alpha", kind: "unknown", url: "https://example.com" }))
      .rejects.toThrow("Unsupported workspace resource kind");
    await expect(api.removeWorkspaceTodo({ workspaceId: "alpha", todoId: "missing" }))
      .rejects.toThrow("Workspace todo not found: missing");
    failWith(new Error("persistence failed"));
    await expect(api.replaceWorkspaceNotes({ workspaceId: "alpha", notes: "unsaved" }))
      .rejects.toThrow("persistence failed");
    expect(state.has("alpha")).toBe(false);
    expect(calls).toEqual(["update:alpha", "update:alpha"]);
  });
});
