import { describe, expect, test } from "bun:test";
import { buildCurrentTaskAwarenessRetrievedContext } from "../src/lib/task-context/current-task-awareness";
import { createEmptyWorkspaceInformation } from "../src/lib/workspace-information";
import type { Task } from "../src/types/chat";

function createTask(args: {
  id: string;
  title: string;
  provider?: Task["provider"];
}): Task {
  return {
    id: args.id,
    title: args.title,
    provider: args.provider ?? "codex",
    updatedAt: "2026-04-07T00:00:00.000Z",
    unread: false,
    archivedAt: null,
    controlMode: "interactive",
    controlOwner: "stave",
  };
}

describe("buildCurrentTaskAwarenessRetrievedContext", () => {
  test("builds workspace-scoped task chat guidance with current workspace information", () => {
    const workspaceInformation = createEmptyWorkspaceInformation();
    workspaceInformation.turnSummary = {
      turnId: "turn-1",
      taskId: "task-1",
      taskTitle: "Make task chat understand the information panel",
      generatedAt: "2026-04-10T00:00:00.000Z",
      model: "gpt-5.4-mini",
      requestSummary:
        "Summarise the latest workspace activity in the Information panel.",
      workSummary:
        "Prepared the UI plan and identified the Information panel integration points.",
    };
    workspaceInformation.notes =
      "Check the design handoff before editing the prompt input.";
    workspaceInformation.figmaResources = [
      {
        id: "figma-1",
        title: "Prompt Input Redesign",
        url: "https://www.figma.com/design/FILE123/Prompt?node-id=1-2",
        nodeId: "1:2",
        note: "Latest approved mock",
      },
    ];
    workspaceInformation.amplifyLinks = [
      {
        id: "amplify-1",
        url: "https://main.d123abc456.amplifyapp.com",
        label: "main",
        note: "Preview deploy",
      },
    ];
    workspaceInformation.storybookResources = [
      {
        id: "storybook-1",
        title: "PromptInput stories",
        url: "https://silver-chainsaw-ww7n83m.pages.github.io/?path=/docs/prompt-input--docs",
        note: "Interactive states",
        access: {
          kind: "requires_github_auth",
          provider: "github-pages",
          externalRepo: "acme/storybook",
          readableVia: "github_cli",
          sourceHint: "storybook-static",
        },
      },
    ];

    const context = buildCurrentTaskAwarenessRetrievedContext({
      workspaceId: "ws-123",
      workspaceName: "feature/task-awareness",
      workspacePath: "/tmp/stave/.stave/workspaces/feature-task-awareness",
      workspaceBranch: "feature/task-awareness",
      projectName: "Stave",
      projectPath: "/tmp/stave",
      taskId: "task-1",
      tasks: [
        createTask({
          id: "task-1",
          title: "Make task chat understand the information panel",
        }),
        createTask({ id: "task-2", title: "Tighten the MCP request log UI" }),
      ],
      workspaceInformation,
    });

    expect(context.sourceId).toBe("stave:current-task-awareness");
    expect(context.title).toBe("Current Stave Task Context");
    expect(context.content).toContain(
      "The Information panel is workspace-scoped, not task-scoped.",
    );
    expect(context.content).toContain("workspaceId or taskId");
    expect(context.content).toContain("id: ws-123");
    expect(context.content).toContain(
      "title: Make task chat understand the information panel",
    );
    expect(context.content).toContain("Latest turn summary: present");
    expect(context.content).toContain("Storybook: 1");
    expect(context.content).toContain("Amplify links: 1");
    expect(context.content).toContain("Amplify deploy links:");
    expect(context.content).toContain(
      "main | https://main.d123abc456.amplifyapp.com | Preview deploy",
    );
    expect(context.content).toContain(
      "immediately register it with `stave_add_workspace_amplify_link`",
    );
    expect(context.content).toContain(
      "Summarise the latest workspace activity in the Information panel. | Prepared the UI plan and identified the Information panel integration points.",
    );
    expect(context.content).toContain("Workspace Conventions:");
    expect(context.content).toContain(
      "new workspace plan files belong under `.stave/context/plans`",
    );
    expect(context.content).toContain("Token Budget Guidance:");
    expect(context.content).toContain(
      "Do not call `stave_get_workspace_information` just to re-read fields already shown here.",
    );
    expect(context.content).toContain(
      "prefer `stave_lens_snapshot`, scoped `stave_lens_get_text`, or screenshots before raw HTML",
    );
    expect(context.content).toContain("Handoff procedure:");
    expect(context.content).toContain(
      "Write a plan file at the target's `.stave/context/plans/<taskIdPrefix>_<timestamp>.md`",
    );
    expect(context.content).toContain(
      "Do NOT copy the source workspace's plan, notes, or todos verbatim",
    );
    expect(context.content).toContain(
      'append ONLY a short pointer like "See plan:',
    );
    // The handoff procedure must remind the agent to wait until plan mode has
    // exited before writing the plan file — otherwise the agent attempts the
    // Write mid-plan, gets blocked, and stalls.
    expect(context.content.toLowerCase()).toMatch(
      /after (?:you )?exit(?:ing)? plan mode/,
    );
    expect(context.content).toContain(
      "PromptInput stories | https://silver-chainsaw-ww7n83m.pages.github.io/?path=/docs/prompt-input--docs | access requires GitHub auth, provider github-pages, repo acme/storybook, read via GitHub CLI/API instead of direct web fetch, source storybook-static | Interactive states",
    );
    expect(context.content).toContain(
      "Prompt Input Redesign | node 1:2 | https://www.figma.com/design/FILE123/Prompt?node-id=1-2 | Latest approved mock",
    );
  });

  test("bounds visible tasks and resource lists so the prompt stays compact", () => {
    const workspaceInformation = createEmptyWorkspaceInformation();
    workspaceInformation.figmaResources = Array.from(
      { length: 6 },
      (_, index) => ({
        id: `figma-${index + 1}`,
        title: `Resource ${index + 1}`,
        url: `https://www.figma.com/design/FILE${index + 1}`,
        nodeId: "",
        note: "",
      }),
    );

    const context = buildCurrentTaskAwarenessRetrievedContext({
      workspaceId: "ws-compact",
      taskId: "task-1",
      tasks: Array.from({ length: 10 }, (_, index) =>
        createTask({
          id: `task-${index + 1}`,
          title: `Task ${index + 1}`,
        }),
      ),
      workspaceInformation,
    });

    expect(context.content).toContain("[current] Task 1");
    expect(context.content).toContain("[other] Task 8 | task id: task-8");
    expect(context.content).not.toContain("Task 9 | task id: task-9");
    expect(context.content).toContain(
      "Resource 5 | https://www.figma.com/design/FILE5",
    );
    expect(context.content).not.toContain(
      "Resource 6 | https://www.figma.com/design/FILE6",
    );
  });
});
