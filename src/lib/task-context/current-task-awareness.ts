import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import {
  formatStorybookAccessContext,
  type WorkspaceInformationState,
} from "@/lib/workspace-information";
import type { Task } from "@/types/chat";

const MAX_TEXT_CHARS = 320;
const MAX_NOTES_CHARS = 600;
const MAX_VISIBLE_TASKS = 3;
const MAX_VISIBLE_RESOURCES = 5;
const MAX_VISIBLE_CUSTOM_FIELDS = 8;

function normalizeInlineText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function truncateText(value: string, maxChars = MAX_TEXT_CHARS) {
  const normalized = normalizeInlineText(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function formatSection(args: {
  label: string;
  items: string[];
  totalCount?: number;
}) {
  if (args.items.length === 0) {
    return [];
  }
  const count = args.totalCount ? ` (${args.totalCount})` : "";
  return [
    `${args.label}${count}:`,
    ...args.items.map((item) => `- ${truncateText(item)}`),
  ];
}

function buildWorkspaceInformationDetailLines(info: WorkspaceInformationState) {
  const storybookResources = info.storybookResources ?? [];
  const turnSummaryItems = info.turnSummary
    ? [
        [
          info.turnSummary.taskTitle || "Latest turn",
          info.turnSummary.requestSummary,
          info.turnSummary.workSummary,
        ]
          .filter((value) => value.trim().length > 0)
          .join(" | "),
      ]
    : [];
  const noteItems = info.notes.trim()
    ? [truncateText(info.notes, MAX_NOTES_CHARS)]
    : [];
  const todoItems = info.todos
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((todo) => `${todo.completed ? "[done]" : "[open]"} ${todo.text}`);
  const jiraItems = info.jiraIssues
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((issue) =>
      [
        issue.issueKey || "Jira",
        issue.title,
        issue.status,
        issue.url,
        issue.note,
      ]
        .filter((value) => value.trim().length > 0)
        .join(" | "),
    );
  const confluenceItems = info.confluencePages
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((page) =>
      [page.title || "Confluence page", page.spaceKey, page.url, page.note]
        .filter((value) => value.trim().length > 0)
        .join(" | "),
    );
  const figmaItems = info.figmaResources
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((resource) =>
      [
        resource.title || "Figma resource",
        resource.nodeId ? `node ${resource.nodeId}` : "",
        resource.url,
        resource.note,
      ]
        .filter((value) => value.trim().length > 0)
        .join(" | "),
    );
  const storybookItems = storybookResources
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((resource) =>
      [
        resource.title || "Storybook resource",
        resource.url,
        formatStorybookAccessContext(resource),
        resource.note,
      ]
        .filter((value) => value.trim().length > 0)
        .join(" | "),
    );
  const slackItems = info.slackThreads
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((thread) =>
      [thread.channelName || "Slack thread", thread.url, thread.note]
        .filter((value) => value.trim().length > 0)
        .join(" | "),
    );
  const amplifyItems = (info.amplifyLinks ?? [])
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((link) =>
      [link.label || "Amplify deploy", link.url, link.note]
        .filter((value) => value.trim().length > 0)
        .join(" | "),
    );
  const linkedPrItems = info.linkedPullRequests
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((pullRequest) =>
      [
        pullRequest.title || "Linked pull request",
        pullRequest.status,
        pullRequest.url,
        pullRequest.note,
      ]
        .filter((value) => value.trim().length > 0)
        .join(" | "),
    );
  const customFieldItems = info.customFields
    .slice(0, MAX_VISIBLE_CUSTOM_FIELDS)
    .map((field) => {
      const value =
        field.type === "single_select"
          ? field.value || "(empty)"
          : field.type === "boolean"
            ? String(field.value)
            : field.type === "number"
              ? field.value == null
                ? "(empty)"
                : String(field.value)
              : field.value.trim() || "(empty)";
      return `${field.label} = ${value}`;
    });

  return [
    ...formatSection({
      label: "Latest turn summary",
      items: turnSummaryItems,
    }),
    ...formatSection({
      label: "Notes",
      items: noteItems,
    }),
    ...formatSection({
      label: "Todos",
      items: todoItems,
      totalCount: info.todos.length,
    }),
    ...formatSection({
      label: "Linked pull requests",
      items: linkedPrItems,
      totalCount: info.linkedPullRequests.length,
    }),
    ...formatSection({
      label: "Jira issues",
      items: jiraItems,
      totalCount: info.jiraIssues.length,
    }),
    ...formatSection({
      label: "Confluence pages",
      items: confluenceItems,
      totalCount: info.confluencePages.length,
    }),
    ...formatSection({
      label: "Storybook resources",
      items: storybookItems,
      totalCount: storybookResources.length,
    }),
    ...formatSection({
      label: "Amplify deploy links",
      items: amplifyItems,
      totalCount: (info.amplifyLinks ?? []).length,
    }),
    ...formatSection({
      label: "Slack threads",
      items: slackItems,
      totalCount: info.slackThreads.length,
    }),
    ...formatSection({
      label: "Figma resources",
      items: figmaItems,
      totalCount: info.figmaResources.length,
    }),
    ...formatSection({
      label: "Custom fields",
      items: customFieldItems,
      totalCount: info.customFields.length,
    }),
  ];
}

export function buildCurrentTaskAwarenessRetrievedContext(args: {
  workspaceId: string;
  workspaceName?: string | null;
  workspacePath?: string | null;
  workspaceBranch?: string | null;
  projectName?: string | null;
  projectPath?: string | null;
  taskId: string;
  tasks: Task[];
  workspaceInformation: WorkspaceInformationState;
  /**
   * Include the static procedural guidance (workspace conventions, token-budget
   * guidance, handoff procedure). These blocks never change turn-to-turn, so
   * callers inject them only on the first turn of a task and omit them
   * afterwards to keep the per-turn prompt small. Defaults to `true`.
   */
  includeStaticGuidance?: boolean;
}): CanonicalRetrievedContextPart {
  const includeStaticGuidance = args.includeStaticGuidance ?? true;
  const currentTask =
    args.tasks.find((task) => task.id === args.taskId) ?? null;
  const visibleTasks = args.tasks
    .filter((task) => task.id !== args.taskId)
    .slice(0, MAX_VISIBLE_TASKS)
    .map(
      (task) =>
        `${truncateText(task.title, 140)} | task id: ${task.id}`,
    );

  const projectLines = [
    `- name: ${args.projectName?.trim() || "(unknown)"}`,
    `- path: ${args.projectPath?.trim() || "(unknown)"}`,
  ];
  const workspaceLines = [
    `- id: ${args.workspaceId}`,
    `- name: ${args.workspaceName?.trim() || "(unknown)"}`,
    `- root: ${args.workspacePath?.trim() || "(unknown)"}`,
    `- branch: ${args.workspaceBranch?.trim() || "(unknown)"}`,
  ];
  const taskLines = [
    `- id: ${args.taskId}`,
    `- title: ${currentTask?.title?.trim() || "(unknown)"}`,
    `- provider: ${currentTask?.provider ?? "(unknown)"}`,
  ];
  const workspaceConventionLines = [
    "- new workspace plan files belong under `.stave/context/plans`",
    "- use `.stave/context/plans/<taskIdPrefix>_<timestamp>.md` for new plan markdown files",
    "- When you trigger, complete, or learn of an AWS Amplify deploy for this workspace (any *.amplifyapp.com URL, or a deploy URL the user shares), immediately register it with `stave_add_workspace_amplify_link` (workspaceId, url, and a branch/environment label). Do this automatically without being asked.",
    "- When you discover a Jira issue, pull request, Confluence page, Figma design, Slack thread, or Storybook link that this workspace's work relates to (mentioned by the user, found while working, or created by you), register it with the matching `stave_add_workspace_*` tool automatically without being asked. Registration is idempotent: duplicates are detected by canonical identity (e.g. Jira issue key, PR number) and merged into the existing entry, so re-registering is safe — never add the same Jira issue key or PR twice yourself, and prefer passing the issue key/URL as-is over reformatting it.",
  ];
  const tokenBudgetLines = [
    "- Treat this injected context as current. Do not call `stave_get_workspace_information` just to re-read fields already shown here.",
    "- Keep Information panel notes and todos compact. Put long handoff or execution details in `.stave/context/plans/` and reference the plan path instead.",
    "- For Lens inspection, prefer `stave_lens_snapshot`, scoped `stave_lens_get_text`, or screenshots before raw HTML, console, or network dumps.",
    "- Lens tools reuse the visible/recent workspace session or create a hidden default automatically. Stave applies the user's presentation setting when visual inspection or page interaction starts; use `stave_lens_present_session` only when immediate user interaction, sign-in, or explicit visual confirmation is required.",
    "- When using Lens log or HTML tools, pass the narrowest selector or smallest useful limit/maxChars.",
  ];
  const handoffProcedureLines = [
    "When you create a new Stave workspace to hand off follow-up work:",
    "1. Use `stave_create_workspace` to create the target workspace and capture its `root` path.",
    "2. Write a plan file at the target's `.stave/context/plans/<taskIdPrefix>_<timestamp>.md`. Use the `Write` tool directly against the new worktree root returned by `stave_create_workspace`. Perform this Write only after exiting plan mode (via `ExitPlanMode`) — plan mode blocks Writes to anything except that handoff path, so it is safer to finish planning first. Do NOT put the plan body into Notes.",
    "3. If no task id exists yet, use a placeholder prefix such as `handoff` and rename the file to `<newTaskIdPrefix>_<timestamp>.md` once a task id is assigned.",
    '4. In the target workspace\'s Notes, append ONLY a short pointer like "See plan: .stave/context/plans/<filename>.md". Do not duplicate the plan body into Notes.',
    "5. Target Todos should be terse action items that point back at the plan file, not a re-statement of the plan.",
    "6. The plan file must describe ONLY the handoff sub-task and the context needed to execute it. Do NOT copy the source workspace's plan, notes, or todos verbatim — the source workspace's plan stays in the source. Cite the source by `workspaceId`/`taskId` when helpful.",
  ];

  const staticGuidanceLines = includeStaticGuidance
    ? [
        "",
        "Workspace Conventions:",
        ...workspaceConventionLines,
        "",
        "Token Budget Guidance:",
        ...tokenBudgetLines,
        "",
        "Handoff procedure:",
        ...handoffProcedureLines,
      ]
    : [
        "",
        "Static workspace and handoff guidance from the first turn still applies.",
      ];
  const workspaceInformationLines = buildWorkspaceInformationDetailLines(
    args.workspaceInformation,
  );

  return {
    type: "retrieved_context",
    sourceId: "stave:current-task-awareness",
    title: "Current Stave Task Context",
    content: [
      "Current Stave task context.",
      'Resolve unqualified references to "this task", "this workspace", and "Information panel" to the task and workspace below. The Information panel is workspace-scoped; ask only when the target is ambiguous.',
      "",
      "Project:",
      ...projectLines,
      "",
      "Workspace:",
      ...workspaceLines,
      "",
      "Task:",
      ...taskLines,
      ...staticGuidanceLines,
      ...(visibleTasks.length > 0
        ? [
            "",
            "Other visible tasks:",
            ...visibleTasks.map((task) => `- ${task}`),
          ]
        : []),
      "",
      ...(workspaceInformationLines.length > 0
        ? ["Workspace Information:", ...workspaceInformationLines]
        : ["Workspace Information: none"]),
    ].join("\n"),
  };
}
