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
      "The Information panel is workspace-scoped",
    );
    expect(context.content).toContain("ask only when the target is ambiguous");
    expect(context.content).toContain("id: ws-123");
    expect(context.content).toContain(
      "title: Make task chat understand the information panel",
    );
    expect(context.content).toContain("Latest turn summary:");
    expect(context.content).toContain("Storybook resources (1):");
    expect(context.content).toContain("Amplify deploy links (1):");
    expect(context.content).not.toContain("Workspace Information Summary:");
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
    expect(context.content).toContain("`stave_lens_present_session`");
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

  test("omits static procedural guidance on follow-up turns but keeps dynamic state", () => {
    const workspaceInformation = createEmptyWorkspaceInformation();
    workspaceInformation.notes = "Follow-up note.";

    const full = buildCurrentTaskAwarenessRetrievedContext({
      workspaceId: "ws-static",
      taskId: "task-1",
      tasks: [createTask({ id: "task-1", title: "Reduce per-turn tokens" })],
      workspaceInformation,
      includeStaticGuidance: true,
    });
    const compact = buildCurrentTaskAwarenessRetrievedContext({
      workspaceId: "ws-static",
      taskId: "task-1",
      tasks: [createTask({ id: "task-1", title: "Reduce per-turn tokens" })],
      workspaceInformation,
      includeStaticGuidance: false,
    });

    // Static blocks drop out when guidance is suppressed.
    expect(full.content).toContain("Handoff procedure:");
    expect(full.content).toContain("Token Budget Guidance:");
    expect(compact.content).not.toContain("Handoff procedure:");
    expect(compact.content).not.toContain("Token Budget Guidance:");
    expect(compact.content).not.toContain(
      "new workspace plan files belong under",
    );
    // A terse pointer replaces the verbose guidance so the model still knows
    // the conventions remain in force.
    expect(compact.content).toContain(
      "Static workspace and handoff guidance from the first turn still applies.",
    );
    // Dynamic identity + information state survive on every turn.
    expect(compact.content).toContain("id: ws-static");
    expect(compact.content).toContain("title: Reduce per-turn tokens");
    expect(compact.content).toContain("Notes:");
    expect(compact.content).not.toContain("Other visible tasks:");
    // The compact turn is meaningfully smaller.
    expect(compact.content.length).toBeLessThan(full.content.length);
  });

  test("defaults to including static guidance when the flag is omitted", () => {
    const context = buildCurrentTaskAwarenessRetrievedContext({
      workspaceId: "ws-default",
      taskId: "task-1",
      tasks: [createTask({ id: "task-1", title: "Task" })],
      workspaceInformation: createEmptyWorkspaceInformation(),
    });
    expect(context.content).toContain("Handoff procedure:");
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

    expect(context.content).toContain("Other visible tasks:");
    expect(context.content).toContain("Task 2 | task id: task-2");
    expect(context.content).toContain("Task 4 | task id: task-4");
    expect(context.content).not.toContain("Task 5 | task id: task-5");
    expect(context.content).toContain(
      "Resource 5 | https://www.figma.com/design/FILE5",
    );
    expect(context.content).not.toContain(
      "Resource 6 | https://www.figma.com/design/FILE6",
    );
  });

  test("omits empty information sections from follow-up prompts", () => {
    const context = buildCurrentTaskAwarenessRetrievedContext({
      workspaceId: "ws-empty",
      taskId: "task-1",
      tasks: [createTask({ id: "task-1", title: "Task" })],
      workspaceInformation: createEmptyWorkspaceInformation(),
      includeStaticGuidance: false,
    });

    expect(context.content).toContain("Workspace Information: none");
    expect(context.content).not.toContain("Notes:");
    expect(context.content).not.toContain("Todos:");
    expect(context.content).not.toContain("Linked pull requests:");
    expect(context.content.length).toBeLessThan(750);
  });
});
