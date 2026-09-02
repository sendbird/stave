import { describe, expect, test } from "bun:test";
import {
  buildCurrentTaskAwarenessRetrievedContextParts,
  MAX_WORKSPACE_INFORMATION_CHARS,
  STAVE_CURRENT_TASK_AWARENESS_SOURCE_ID,
  STAVE_LATEST_TURN_SUMMARY_SOURCE_ID,
  STAVE_MCP_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS,
  STAVE_WORKSPACE_GUIDANCE_SOURCE_ID,
  STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
} from "../src/lib/task-context/current-task-awareness";
import { createEmptyWorkspaceInformation } from "../src/lib/workspace-information";
import type { CanonicalRetrievedContextPart } from "../src/lib/providers/provider.types";
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

function partBySourceId(
  parts: CanonicalRetrievedContextPart[],
  sourceId: string,
) {
  return parts.find((part) => part.sourceId === sourceId) ?? null;
}

function contentBySourceId(
  parts: CanonicalRetrievedContextPart[],
  sourceId: string,
) {
  return partBySourceId(parts, sourceId)?.content ?? "";
}

describe("buildCurrentTaskAwarenessRetrievedContextParts", () => {
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
    workspaceInformation.connectedBrowserTab = {
      providerId: "codex",
      status: "connected",
      requestedAt: "2026-04-10T01:00:00.000Z",
      lastUpdatedAt: "2026-04-10T01:00:01.000Z",
    };
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

    const parts = buildCurrentTaskAwarenessRetrievedContextParts({
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

    expect(parts.map((part) => part.sourceId)).toEqual([
      STAVE_CURRENT_TASK_AWARENESS_SOURCE_ID,
      STAVE_WORKSPACE_GUIDANCE_SOURCE_ID,
      STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
      STAVE_LATEST_TURN_SUMMARY_SOURCE_ID,
    ]);
    expect(
      partBySourceId(parts, STAVE_CURRENT_TASK_AWARENESS_SOURCE_ID)?.title,
    ).toBe("Current Stave Task Context");

    const identity = contentBySourceId(
      parts,
      STAVE_CURRENT_TASK_AWARENESS_SOURCE_ID,
    );
    expect(identity).toContain("The Information panel is workspace-scoped");
    expect(identity).toContain("ask only when the target is ambiguous");
    expect(identity).toContain("id: ws-123");
    expect(identity).toContain(
      "title: Make task chat understand the information panel",
    );

    const guidance = contentBySourceId(parts, STAVE_WORKSPACE_GUIDANCE_SOURCE_ID);
    expect(guidance).toContain("Workspace Conventions:");
    expect(guidance).toContain(
      "new workspace plan files belong under `.stave/context/plans`",
    );
    expect(guidance).toContain("Token Budget Guidance:");
    expect(guidance).toContain(
      "Do not call `stave_get_workspace_information` just to re-read fields already shown here.",
    );
    expect(guidance).toContain(
      "prefer `stave_lens_snapshot`, scoped `stave_lens_get_text`, or screenshots before raw HTML",
    );
    expect(guidance).toContain("`stave_lens_present_session`");
    expect(guidance).toContain(
      "`@web` requests the active provider's native external-browser integration",
    );
    expect(guidance).toContain("Handoff procedure:");
    expect(guidance).toContain(
      "Write a plan file at the target's `.stave/context/plans/<taskIdPrefix>_<timestamp>.md`",
    );
    expect(guidance).toContain(
      "Do NOT copy the source workspace's plan, notes, or todos verbatim",
    );
    expect(guidance).toContain('append ONLY a short pointer like "See plan:');
    // The handoff procedure must remind the agent to wait until plan mode has
    // exited before writing the plan file — otherwise the agent attempts the
    // Write mid-plan, gets blocked, and stalls.
    expect(guidance.toLowerCase()).toMatch(
      /after (?:you )?exit(?:ing)? plan mode/,
    );
    // The static conventions must stay universal: no service-specific
    // auto-register directive (e.g. AWS Amplify) is injected for every user.
    expect(guidance).not.toContain("stave_add_workspace_amplify_link");
    expect(guidance).toContain(
      "register it with the matching `stave_add_workspace_*` tool",
    );
    expect(guidance).toContain("deploy preview URL");

    const information = contentBySourceId(
      parts,
      STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
    );
    expect(information).toContain("Connected browser tab:");
    expect(information).toContain(
      "codex | connected | provider-native browser extension",
    );
    expect(information).toContain("Storybook resources (1):");
    expect(information).toContain("Amplify deploy links (1):");
    expect(information).not.toContain("Workspace Information Summary:");
    expect(information).toContain(
      "main | https://main.d123abc456.amplifyapp.com | Preview deploy",
    );
    expect(information).toContain(
      "PromptInput stories | https://silver-chainsaw-ww7n83m.pages.github.io/?path=/docs/prompt-input--docs | access requires GitHub auth, provider github-pages, repo acme/storybook, read via GitHub CLI/API instead of direct web fetch, source storybook-static | Interactive states",
    );
    expect(information).toContain(
      "Prompt Input Redesign | node 1:2 | https://www.figma.com/design/FILE123/Prompt?node-id=1-2 | Latest approved mock",
    );
    // The turn summary moved into its own first-turn-only part.
    expect(information).not.toContain("Latest turn summary:");

    const turnSummary = contentBySourceId(
      parts,
      STAVE_LATEST_TURN_SUMMARY_SOURCE_ID,
    );
    expect(turnSummary).toContain("Latest turn summary:");
    expect(turnSummary).toContain(
      "Summarise the latest workspace activity in the Information panel. | Prepared the UI plan and identified the Information panel integration points.",
    );
  });

  test("omits a raw browser-tab timestamp so an idle turn's block stays byte-identical", () => {
    const workspaceInformation = createEmptyWorkspaceInformation();
    workspaceInformation.connectedBrowserTab = {
      providerId: "codex",
      status: "connected",
      requestedAt: "2026-04-10T01:00:00.000Z",
      lastUpdatedAt: "2026-04-10T01:00:01.000Z",
    };

    const information = contentBySourceId(
      buildCurrentTaskAwarenessRetrievedContextParts({
        workspaceId: "ws-clock",
        taskId: "task-1",
        tasks: [createTask({ id: "task-1", title: "Task" })],
        workspaceInformation,
      }),
      STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
    );

    expect(information).not.toContain("2026-04-10T01:00:01.000Z");
    expect(information).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  test("caps the Workspace Information body and points at the MCP tool for the rest", () => {
    const workspaceInformation = createEmptyWorkspaceInformation();
    workspaceInformation.customFields = Array.from(
      { length: 8 },
      (_, index) => ({
        id: `field-${index + 1}`,
        label: `Field ${index + 1} ${"x".repeat(280)}`,
        type: "text" as const,
        value: "y".repeat(280),
      }),
    );
    workspaceInformation.todos = Array.from({ length: 5 }, (_, index) => ({
      id: `todo-${index + 1}`,
      text: "z".repeat(300),
      completed: false,
    }));

    const information = contentBySourceId(
      buildCurrentTaskAwarenessRetrievedContextParts({
        workspaceId: "ws-cap",
        taskId: "task-1",
        tasks: [createTask({ id: "task-1", title: "Task" })],
        workspaceInformation,
      }),
      STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
    );

    expect(information.length).toBeLessThan(
      MAX_WORKSPACE_INFORMATION_CHARS + 250,
    );
    expect(information).toContain(
      "call `stave_get_workspace_information` for the remaining",
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

    const parts = buildCurrentTaskAwarenessRetrievedContextParts({
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

    const identity = contentBySourceId(
      parts,
      STAVE_CURRENT_TASK_AWARENESS_SOURCE_ID,
    );
    expect(identity).toContain("Other visible tasks:");
    expect(identity).toContain("Task 2 | task id: task-2");
    expect(identity).toContain("Task 4 | task id: task-4");
    expect(identity).not.toContain("Task 5 | task id: task-5");

    const information = contentBySourceId(
      parts,
      STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
    );
    expect(information).toContain(
      "Resource 5 | https://www.figma.com/design/FILE5",
    );
    expect(information).not.toContain(
      "Resource 6 | https://www.figma.com/design/FILE6",
    );
  });

  test("omits empty information sections and the turn-summary part entirely", () => {
    const parts = buildCurrentTaskAwarenessRetrievedContextParts({
      workspaceId: "ws-empty",
      taskId: "task-1",
      tasks: [createTask({ id: "task-1", title: "Task" })],
      workspaceInformation: createEmptyWorkspaceInformation(),
    });

    expect(partBySourceId(parts, STAVE_LATEST_TURN_SUMMARY_SOURCE_ID)).toBeNull();
    const information = contentBySourceId(
      parts,
      STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
    );
    expect(information).toBe("Workspace Information: none");
    expect(
      contentBySourceId(parts, STAVE_CURRENT_TASK_AWARENESS_SOURCE_ID),
    ).not.toContain("Other visible tasks:");
  });

  test("exports every Stave-scoped source id so runtimes can drop them together", () => {
    expect([...STAVE_MCP_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS]).toEqual([
      STAVE_CURRENT_TASK_AWARENESS_SOURCE_ID,
      STAVE_WORKSPACE_GUIDANCE_SOURCE_ID,
      STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
      STAVE_LATEST_TURN_SUMMARY_SOURCE_ID,
    ]);
  });
});
