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
/**
 * Upper bound for the rendered `Workspace Information` body. The panel can grow
 * without limit (todos, linked resources, custom fields), and the whole block is
 * re-assembled every turn, so an unbounded dump silently becomes the largest
 * recurring prompt cost in a long-lived workspace. Past the cap the agent is
 * pointed at `stave_get_workspace_information` instead.
 */
export const MAX_WORKSPACE_INFORMATION_CHARS = 2400;

export const STAVE_CURRENT_TASK_AWARENESS_SOURCE_ID =
  "stave:current-task-awareness";
export const STAVE_WORKSPACE_GUIDANCE_SOURCE_ID = "stave:workspace-guidance";
export const STAVE_WORKSPACE_INFORMATION_SOURCE_ID =
  "stave:workspace-information";
export const STAVE_LATEST_TURN_SUMMARY_SOURCE_ID = "stave:latest-turn-summary";

/**
 * Retrieved-context sources that only make sense when the Stave local MCP is
 * attached to the turn. Without those tools the agent cannot act on workspace
 * identity or the Information panel, so the blocks are pure prompt overhead.
 */
export const STAVE_MCP_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS = [
  STAVE_CURRENT_TASK_AWARENESS_SOURCE_ID,
  STAVE_WORKSPACE_GUIDANCE_SOURCE_ID,
  STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
  STAVE_LATEST_TURN_SUMMARY_SOURCE_ID,
] as const;

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

/**
 * Cap the assembled Information panel body on whole-line boundaries so the
 * remaining text stays parseable, and tell the agent how to read the rest.
 */
function capWorkspaceInformationLines(lines: string[]) {
  let used = 0;
  const kept: string[] = [];
  for (const line of lines) {
    const next = used + line.length + 1;
    if (next > MAX_WORKSPACE_INFORMATION_CHARS) {
      kept.push(
        `- (truncated: call \`stave_get_workspace_information\` for the remaining ${lines.length - kept.length} lines)`,
      );
      return kept;
    }
    kept.push(line);
    used = next;
  }
  return kept;
}

function buildWorkspaceInformationDetailLines(info: WorkspaceInformationState) {
  const storybookResources = info.storybookResources ?? [];
  const noteItems = info.notes.trim()
    ? [truncateText(info.notes, MAX_NOTES_CHARS)]
    : [];
  const connectedBrowserItems = info.connectedBrowserTab
    ? [
        [
          info.connectedBrowserTab.providerId,
          info.connectedBrowserTab.status,
          "provider-native browser extension",
        ].join(" | "),
      ]
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
  const craneItems = (info.craneIssues ?? [])
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((issue) =>
      [
        issue.issueKey || "Crane",
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

  return capWorkspaceInformationLines([
    ...formatSection({
      label: "Connected browser tab",
      items: connectedBrowserItems,
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
      label: "Crane issues",
      items: craneItems,
      totalCount: (info.craneIssues ?? []).length,
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
  ]);
}

function buildLatestTurnSummaryLine(info: WorkspaceInformationState) {
  if (!info.turnSummary) {
    return null;
  }
  const line = [
    info.turnSummary.taskTitle || "Latest turn",
    info.turnSummary.requestSummary,
    info.turnSummary.workSummary,
  ]
    .filter((value) => value.trim().length > 0)
    .join(" | ");
  return line.trim().length > 0 ? truncateText(line) : null;
}

const WORKSPACE_CONVENTION_LINES = [
  "- new workspace plan files belong under `.stave/context/plans`",
  "- use `.stave/context/plans/<taskIdPrefix>_<timestamp>.md` for new plan markdown files",
  "- When you discover a Jira issue, pull request, Confluence page, Figma design, Slack thread, Storybook link, or deploy preview URL that this workspace's work relates to (mentioned by the user, found while working, or created by you), register it with the matching `stave_add_workspace_*` tool automatically without being asked. Registration is idempotent: duplicates are detected by canonical identity (e.g. Jira issue key, PR number) and merged into the existing entry, so re-registering is safe — never add the same Jira issue key or PR twice yourself, and prefer passing the issue key/URL as-is over reformatting it.",
];

const TOKEN_BUDGET_LINES = [
  "- Treat this injected context as current. Do not call `stave_get_workspace_information` just to re-read fields already shown here.",
  "- Keep Information panel notes and todos compact. Put long handoff or execution details in `.stave/context/plans/` and reference the plan path instead.",
  "- For Lens inspection, prefer `stave_lens_snapshot`, scoped `stave_lens_get_text`, or screenshots before raw HTML, console, or network dumps.",
  "- After changing code that a Lens page renders, reload the page before verifying unless the dev server has hot reload; a Lens read taken against the pre-change bundle looks like the fix did not work. Never `stave_lens_navigate` to the URL a tab is already on — that destroys in-progress page state such as a filled form or an open dialog; use `stave_lens_reload` instead.",
  "- Address Lens elements by the `ref` a snapshot gave them (`d1e12`, `d1f1e3`), not by CSS selector. A ref is keyed to the element the snapshot described, so a page that changed underneath fails loudly; a selector silently matches whatever is there now. Take a fresh snapshot after any action that changes the page, and use a selector only for something a snapshot cannot name.",
  "- `@web` requests the active provider's native external-browser integration for this interactive turn. Use its browser extension tools so existing tabs and signed-in page state can be referenced; do not substitute Lens or a one-way URL launcher.",
  "- Native browser site approvals and sensitive-action confirmations remain provider-owned. Never request, inspect, or expose raw cookies, passwords, or session tokens.",
  "- Lens tools reuse the visible/recent workspace session or create a hidden default automatically. Stave applies the user's presentation setting when visual inspection or page interaction starts; use `stave_lens_present_session` only when immediate user interaction, sign-in, or explicit visual confirmation is required.",
  "- When using Lens log or HTML tools, pass the narrowest selector or smallest useful limit/maxChars.",
];

const HANDOFF_PROCEDURE_LINES = [
  "When you create a new Stave workspace to hand off follow-up work:",
  "1. Use `stave_create_workspace` to create the target workspace and capture its `root` path.",
  "2. Write a plan file at the target's `.stave/context/plans/<taskIdPrefix>_<timestamp>.md`. Use the `Write` tool directly against the new worktree root returned by `stave_create_workspace`. Perform this Write only after exiting plan mode (via `ExitPlanMode`) — plan mode blocks Writes to anything except that handoff path, so it is safer to finish planning first. Do NOT put the plan body into Notes.",
  "3. If no task id exists yet, use a placeholder prefix such as `handoff` and rename the file to `<newTaskIdPrefix>_<timestamp>.md` once a task id is assigned.",
  '4. In the target workspace\'s Notes, append ONLY a short pointer like "See plan: .stave/context/plans/<filename>.md". Do not duplicate the plan body into Notes.',
  "5. Target Todos should be terse action items that point back at the plan file, not a re-statement of the plan.",
  "6. The plan file must describe ONLY the handoff sub-task and the context needed to execute it. Do NOT copy the source workspace's plan, notes, or todos verbatim — the source workspace's plan stays in the source. Cite the source by `workspaceId`/`taskId` when helpful.",
];

export type CurrentTaskAwarenessArgs = {
  workspaceId: string;
  workspaceName?: string | null;
  workspacePath?: string | null;
  workspaceBranch?: string | null;
  projectName?: string | null;
  projectPath?: string | null;
  taskId: string;
  tasks: Task[];
  workspaceInformation: WorkspaceInformationState;
};

/**
 * Build the Stave task-context blocks as separate retrieved-context parts.
 *
 * The split exists so the prompt funnel can drop the parts that never change
 * turn-to-turn once the provider session is primed: `stave:workspace-guidance`
 * and `stave:latest-turn-summary` are already in the resumed transcript, while
 * identity and the Information panel dump stay because they can change.
 */
export function buildCurrentTaskAwarenessRetrievedContextParts(
  args: CurrentTaskAwarenessArgs,
): CanonicalRetrievedContextPart[] {
  const currentTask = args.tasks.find((task) => task.id === args.taskId) ?? null;
  const visibleTasks = args.tasks
    .filter((task) => task.id !== args.taskId)
    .slice(0, MAX_VISIBLE_TASKS)
    .map((task) => `${truncateText(task.title, 140)} | task id: ${task.id}`);

  const identityContent = [
    "Current Stave task context.",
    'Resolve unqualified references to "this task", "this workspace", and "Information panel" to the task and workspace below. The Information panel is workspace-scoped; ask only when the target is ambiguous.',
    "",
    "Project:",
    `- name: ${args.projectName?.trim() || "(unknown)"}`,
    `- path: ${args.projectPath?.trim() || "(unknown)"}`,
    "",
    "Workspace:",
    `- id: ${args.workspaceId}`,
    `- name: ${args.workspaceName?.trim() || "(unknown)"}`,
    `- root: ${args.workspacePath?.trim() || "(unknown)"}`,
    `- branch: ${args.workspaceBranch?.trim() || "(unknown)"}`,
    "",
    "Task:",
    `- id: ${args.taskId}`,
    `- title: ${currentTask?.title?.trim() || "(unknown)"}`,
    `- provider: ${currentTask?.provider ?? "(unknown)"}`,
    ...(visibleTasks.length > 0
      ? ["", "Other visible tasks:", ...visibleTasks.map((task) => `- ${task}`)]
      : []),
  ].join("\n");

  const guidanceContent = [
    "Workspace Conventions:",
    ...WORKSPACE_CONVENTION_LINES,
    "",
    "Token Budget Guidance:",
    ...TOKEN_BUDGET_LINES,
    "",
    "Handoff procedure:",
    ...HANDOFF_PROCEDURE_LINES,
  ].join("\n");

  const workspaceInformationLines = buildWorkspaceInformationDetailLines(
    args.workspaceInformation,
  );
  const latestTurnSummary = buildLatestTurnSummaryLine(
    args.workspaceInformation,
  );

  const parts: CanonicalRetrievedContextPart[] = [
    {
      type: "retrieved_context",
      sourceId: STAVE_CURRENT_TASK_AWARENESS_SOURCE_ID,
      title: "Current Stave Task Context",
      content: identityContent,
    },
    {
      type: "retrieved_context",
      sourceId: STAVE_WORKSPACE_GUIDANCE_SOURCE_ID,
      title: "Stave Workspace Guidance",
      content: guidanceContent,
    },
    {
      type: "retrieved_context",
      sourceId: STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
      title: "Stave Workspace Information",
      content:
        workspaceInformationLines.length > 0
          ? ["Workspace Information:", ...workspaceInformationLines].join("\n")
          : "Workspace Information: none",
    },
  ];

  if (latestTurnSummary) {
    parts.push({
      type: "retrieved_context",
      sourceId: STAVE_LATEST_TURN_SUMMARY_SOURCE_ID,
      title: "Latest Turn Summary",
      content: `Latest turn summary:\n- ${latestTurnSummary}`,
    });
  }

  return parts;
}
