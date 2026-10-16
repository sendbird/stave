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

  test("a URL-only generic resource add reads its labels from the URL", async () => {
    const { api } = createHarness();
    const add = (kind: string, url: string) =>
      api.addWorkspaceResource({ workspaceId: "alpha", kind, url });

    await add("jira", "https://acme.atlassian.net/browse/ABC-7");
    await add("jira", "https://acme.atlassian.net/projects/no-key");
    await add("crane", "https://atelier.acme.dev/apps/crane/w/TEAM/task/CRN-42");
    await add("confluence", "https://acme.atlassian.net/wiki/spaces/ENG/pages/12345/Release+Plan");
    await add("figma", "https://www.figma.com/design/AbC123/Checkout-Flow?node-id=12-34");
    await add("storybook", "https://storybook.acme.dev/?path=/story/forms-button--primary");
    await add("slack", "https://acme.slack.com/archives/C0123ABC/p1700000000000100");
    const last = await add("amplify", "https://feature-x.d1abcdef.amplifyapp.com/");

    const info = last.workspaceInformation;
    expect(info.jiraIssues.map(({ issueKey, title }) => ({ issueKey, title }))).toEqual([
      { issueKey: "ABC-7", title: "ABC-7" },
      { issueKey: "", title: "Jira issue" },
    ]);
    expect(info.craneIssues?.map(({ issueKey, title }) => ({ issueKey, title }))).toEqual([
      { issueKey: "CRN-42", title: "CRN-42" },
    ]);
    expect(info.confluencePages.map(({ title, spaceKey }) => ({ title, spaceKey }))).toEqual([
      { title: "Release Plan", spaceKey: "ENG" },
    ]);
    expect(info.figmaResources.map(({ title, nodeId }) => ({ title, nodeId }))).toEqual([
      { title: "Checkout Flow", nodeId: "12-34" },
    ]);
    expect(info.storybookResources?.map(({ title }) => title)).toEqual(["forms button primary"]);
    expect(info.slackThreads.map(({ channelName }) => channelName)).toEqual(["C0123ABC"]);
    expect(info.amplifyLinks?.map(({ label }) => label)).toEqual(["feature-x"]);
  });

  test("caller fields win over URL labels, and Storybook access fields are stored", async () => {
    const { api } = createHarness();
    await api.addWorkspaceResource({
      workspaceId: "alpha",
      kind: "confluence",
      url: "https://acme.atlassian.net/wiki/spaces/ENG/pages/12345/Release+Plan",
      title: "Q3 plan",
      spaceKey: "OPS",
    });
    await api.addWorkspaceResource({
      workspaceId: "alpha",
      kind: "amplify",
      url: "https://feature-x.d1abcdef.amplifyapp.com/",
      title: "staging",
    });
    const result = await api.addWorkspaceResource({
      workspaceId: "alpha",
      kind: "storybook",
      url: "https://storybook.acme.dev/?path=/story/forms-button--primary",
      storybookAccessKind: "requires_github_auth",
      storybookExternalRepo: "acme/design-system",
      storybookReadableVia: "github_cli",
      storybookSourceHint: "storybook-static artifact",
    });

    const info = result.workspaceInformation;
    expect(info.confluencePages[0]).toMatchObject({ title: "Q3 plan", spaceKey: "OPS" });
    expect(info.amplifyLinks?.[0]?.label).toBe("staging");
    expect(info.storybookResources?.[0]?.access).toMatchObject({
      kind: "requires_github_auth",
      externalRepo: "acme/design-system",
      readableVia: "github_cli",
      sourceHint: "storybook-static artifact",
    });
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
