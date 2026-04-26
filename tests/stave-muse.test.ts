import { describe, expect, it } from "bun:test";
import {
  buildStaveMuseContextSnapshot,
  createEmptyStaveMuseState,
  findStaveMuseWorkspaceMention,
  resolveStaveMuseLocalAction,
} from "@/lib/stave-muse";
import { createEmptyWorkspaceInformation, createWorkspaceInfoCustomField, createWorkspaceTodoItem } from "@/lib/workspace-information";

describe("createEmptyStaveMuseState", () => {
  it("defaults to the app target", () => {
    const state = createEmptyStaveMuseState();
    expect(state.target.kind).toBe("app");
    expect(state.messages).toEqual([]);
  });

  it("supports app-level default target", () => {
    const state = createEmptyStaveMuseState({ defaultTarget: "app" });
    expect(state.target.kind).toBe("app");
  });
});

describe("resolveStaveMuseLocalAction", () => {
  const todo = createWorkspaceTodoItem();
  todo.text = "release checklist";
  const ownerField = createWorkspaceInfoCustomField({
    type: "text",
    label: "Owner",
  });

  const context = {
    projectName: "Stave",
    projectPath: "/tmp/stave",
    projects: [
      {
        projectName: "Stave",
        projectPath: "/tmp/stave",
        isCurrent: true,
      },
    ],
    workspaces: [
      {
        id: "ws-main",
        name: "Default Workspace",
        branch: "main",
        isActive: true,
        isDefault: true,
      },
      {
        id: "ws-release",
        name: "release",
        branch: "release/1.0",
        isActive: false,
        isDefault: false,
      },
    ],
    tasks: [
      {
        id: "task-1",
        title: "Review release plan",
        isActive: true,
        isResponding: false,
      },
    ],
    activeTaskId: "task-1",
    workspaceInformation: {
      ...createEmptyWorkspaceInformation(),
      todos: [todo],
      jiraIssues: [{
        id: "jira-1",
        issueKey: "APP-123",
        title: "Muse workflow support",
        url: "https://acme.atlassian.net/browse/APP-123",
        status: "Open",
        note: "",
      }],
      linkedPullRequests: [{
        id: "pr-1",
        title: "acme/stave#77",
        url: "https://github.com/acme/stave/pull/77",
        status: "open",
        note: "",
      }],
      confluencePages: [{
        id: "confluence-1",
        title: "Muse spec",
        url: "https://acme.atlassian.net/wiki/spaces/APP/pages/123",
        spaceKey: "APP",
        note: "",
      }],
      figmaResources: [{
        id: "figma-1",
        title: "Muse board",
        url: "https://www.figma.com/design/abc123/muse",
        nodeId: "1:2",
        note: "",
      }],
      slackThreads: [{
        id: "slack-1",
        url: "https://acme.slack.com/archives/C123/p1234567890123456",
        channelName: "proj-support",
        note: "",
      }],
      customFields: [ownerField],
    },
  } as const;

  it("parses workspace switching requests", () => {
    expect(resolveStaveMuseLocalAction({
      input: "switch workspace release",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "switch_workspace",
      workspaceId: "ws-release",
      workspaceName: "release",
    });
  });

  it("parses scripts panel commands", () => {
    expect(resolveStaveMuseLocalAction({
      input: "open scripts",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "toggle_scripts_panel",
      open: true,
    });
  });

  it("parses natural-language task opening requests", () => {
    expect(resolveStaveMuseLocalAction({
      input: "Review release plan task를 사이드바 task 목록에서 직접 클릭해서 열어주세요.",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "select_task",
      taskId: "task-1",
      taskTitle: "Review release plan",
    });
  });

  it("parses direct information updates when enabled", () => {
    expect(resolveStaveMuseLocalAction({
      input: "complete todo release checklist",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "complete_todo",
      todoId: todo.id,
      todoText: "release checklist",
    });
    expect(resolveStaveMuseLocalAction({
      input: "set field \"Owner\" to platform",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "set_custom_field",
      fieldId: ownerField.id,
      fieldLabel: "Owner",
      value: "platform",
    });
  });

  it("does not parse direct information edits when disabled", () => {
    expect(resolveStaveMuseLocalAction({
      input: "complete todo release checklist",
      context,
      allowDirectWorkspaceInfoEdits: false,
    })).toBeNull();
  });

  it("parses linked-resource delete intents", () => {
    expect(resolveStaveMuseLocalAction({
      input: "remove jira APP-123",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "remove_jira_link",
      linkId: "jira-1",
      issueKey: "APP-123",
    });

    expect(resolveStaveMuseLocalAction({
      input: "remove pr #77",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "remove_pull_request_link",
      linkId: "pr-1",
      title: "acme/stave#77",
    });

    expect(resolveStaveMuseLocalAction({
      input: "delete confluence muse spec",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "remove_confluence_link",
      linkId: "confluence-1",
      title: "Muse spec",
    });

    expect(resolveStaveMuseLocalAction({
      input: "remove figma muse board",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "remove_figma_link",
      linkId: "figma-1",
      title: "Muse board",
    });

    expect(resolveStaveMuseLocalAction({
      input: "remove slack proj-support",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "remove_slack_link",
      linkId: "slack-1",
      channelName: "proj-support",
    });
  });

  it("only treats URLs as direct Information actions when the user is explicitly registering the link", () => {
    expect(resolveStaveMuseLocalAction({
      input: "add this Slack thread to the Information panel https://acme.slack.com/archives/C123/p1234567890123456",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "add_slack_link",
      url: "https://acme.slack.com/archives/C123/p1234567890123456",
      channelName: "C123",
    });

    expect(resolveStaveMuseLocalAction({
      input: "Read this Slack thread and create a Jira issue https://acme.slack.com/archives/C123/p1234567890123456",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toBeNull();
  });
});

describe("buildStaveMuseContextSnapshot", () => {
  it("includes scope, project, workspaces, and detailed workspace information", () => {
    const snapshot = buildStaveMuseContextSnapshot({
      target: { kind: "workspace" },
      context: {
        projectName: "Stave",
        projectPath: "/tmp/stave",
        projects: [],
        workspaces: [{
          id: "ws-main",
          name: "Default Workspace",
          branch: "main",
          isActive: true,
          isDefault: true,
        }],
        tasks: [{
          id: "task-1",
          title: "Review release plan",
          isActive: true,
          isResponding: false,
        }],
        activeTaskId: "task-1",
        workspaceInformation: {
          ...createEmptyWorkspaceInformation(),
          notes: "Slack thread captured. Waiting for Jira sync.",
          jiraIssues: [{
            id: "jira-1",
            issueKey: "APP-123",
            title: "Support Muse workflow",
            url: "https://acme.atlassian.net/browse/APP-123",
            status: "Open",
            note: "",
          }],
          slackThreads: [{
            id: "slack-1",
            url: "https://acme.slack.com/archives/C123/p1234567890123456",
            channelName: "proj-support",
            note: "",
          }],
          customFields: [{
            id: "field-1",
            type: "text",
            label: "Owner",
            value: "platform",
          }],
        },
      },
    });

    expect(snapshot).toContain("Stave Muse scope: Current Workspace");
    expect(snapshot).toContain("Current project: Stave");
    expect(snapshot).toContain("Default Workspace");
    expect(snapshot).toContain("Workspace Information Summary:");
    expect(snapshot).toContain("Workspace Information Details:");
    expect(snapshot).toContain("APP-123");
    expect(snapshot).toContain("proj-support");
    expect(snapshot).toContain("Owner = platform");
  });
});

describe("findStaveMuseWorkspaceMention", () => {
  it("matches the default workspace from free-form text", () => {
    expect(findStaveMuseWorkspaceMention({
      input: "stave default workspace 에 새 Task 열고 고쳐달라고 해",
      workspaces: [
        {
          id: "ws-main",
          name: "Default Workspace",
          branch: "main",
          isActive: false,
          isDefault: true,
        },
        {
          id: "ws-release",
          name: "release",
          branch: "release/1.0",
          isActive: true,
          isDefault: false,
        },
      ],
    })).toEqual({
      id: "ws-main",
      name: "Default Workspace",
      branch: "main",
      isActive: false,
      isDefault: true,
    });
  });
});
