import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import {
  createWorkspaceInfoCustomField,
  extractConfluencePageReference,
  extractFigmaResourceReference,
  extractGitHubPullRequestReference,
  extractJiraIssueReference,
  extractSlackThreadReference,
  type WorkspaceInfoFieldType,
  type WorkspaceInformationState,
} from "@/lib/workspace-information";
import type { ChatMessage, PromptDraft } from "@/types/chat";

export const STAVE_MUSE_SESSION_ID = "stave-muse";

export type StaveMuseTargetKind = "app" | "project" | "workspace";
export type StaveMuseDefaultTarget = "app" | "current-project" | "current-workspace";

export interface StaveMuseTarget {
  kind: StaveMuseTargetKind;
}

export interface StaveMuseState {
  open: boolean;
  target: StaveMuseTarget;
  messages: ChatMessage[];
  promptDraft: PromptDraft;
  activeTurnId?: string;
  providerSession?: TaskProviderSessionState;
  nativeSessionReady: boolean;
  focusNonce: number;
}

export interface StaveMuseProjectSummary {
  projectName: string;
  projectPath: string;
  isCurrent: boolean;
}

export interface StaveMuseWorkspaceSummary {
  id: string;
  name: string;
  branch?: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface StaveMuseTaskSummary {
  id: string;
  title: string;
  isActive: boolean;
  isResponding: boolean;
}

export interface StaveMuseLocalActionContext {
  projectName: string | null;
  projectPath: string | null;
  projects: StaveMuseProjectSummary[];
  workspaces: StaveMuseWorkspaceSummary[];
  tasks: StaveMuseTaskSummary[];
  activeTaskId: string;
  workspaceInformation: WorkspaceInformationState;
}

export type StaveMuseLocalAction =
  | { kind: "show_summary" }
  | { kind: "open_settings" }
  | { kind: "toggle_information_panel"; open?: boolean }
  | { kind: "toggle_changes_panel"; open?: boolean }
  | { kind: "toggle_explorer_panel"; open?: boolean }
  | { kind: "toggle_scripts_panel"; open?: boolean }
  | { kind: "toggle_editor"; open?: boolean }
  | { kind: "toggle_terminal"; open?: boolean }
  | { kind: "toggle_workspace_sidebar"; open?: boolean }
  | { kind: "switch_workspace"; workspaceId: string; workspaceName: string }
  | { kind: "open_project"; projectPath: string; projectName: string }
  | { kind: "create_task"; title: string }
  | { kind: "select_task"; taskId: string; taskTitle: string }
  | { kind: "replace_notes"; text: string }
  | { kind: "append_notes"; text: string }
  | { kind: "clear_notes" }
  | { kind: "add_todo"; text: string }
  | { kind: "complete_todo"; todoId: string; todoText: string }
  | { kind: "delete_todo"; todoId: string; todoText: string }
  | { kind: "add_jira_link"; url: string; issueKey: string }
  | { kind: "remove_jira_link"; linkId: string; issueKey: string }
  | { kind: "add_pull_request_link"; url: string; title: string }
  | { kind: "remove_pull_request_link"; linkId: string; title: string }
  | { kind: "add_confluence_link"; url: string; title: string }
  | { kind: "remove_confluence_link"; linkId: string; title: string }
  | { kind: "add_figma_link"; url: string; title: string; nodeId: string }
  | { kind: "remove_figma_link"; linkId: string; title: string }
  | { kind: "add_slack_link"; url: string; channelName: string }
  | { kind: "remove_slack_link"; linkId: string; channelName: string }
  | { kind: "add_custom_field"; fieldType: WorkspaceInfoFieldType; label: string }
  | { kind: "set_custom_field"; fieldId: string; fieldLabel: string; value: string }
  | { kind: "show_information_summary" };

const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};

const INFO_FIELD_TYPE_ALIASES: Array<{ value: WorkspaceInfoFieldType; aliases: string[] }> = [
  { value: "text", aliases: ["text", "string"] },
  { value: "textarea", aliases: ["textarea", "long text", "multiline"] },
  { value: "number", aliases: ["number", "numeric"] },
  { value: "boolean", aliases: ["boolean", "bool", "toggle", "flag"] },
  { value: "date", aliases: ["date", "deadline", "due date"] },
  { value: "url", aliases: ["url", "link"] },
  { value: "single_select", aliases: ["single select", "select", "dropdown"] },
];

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeSearch(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function truncateMuseContextValue(value: string, max = 180) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function quoteWrapped(value: string) {
  const single = value.match(/'([^']+)'/);
  if (single?.[1]) {
    return single[1].trim();
  }
  const double = value.match(/"([^"]+)"/);
  if (double?.[1]) {
    return double[1].trim();
  }
  return null;
}

function extractTrailingValue(args: { input: string; prefixes: string[] }) {
  const normalized = args.input.trim();
  const lower = normalized.toLowerCase();
  for (const prefix of args.prefixes) {
    if (!lower.startsWith(prefix)) {
      continue;
    }
    return normalized.slice(prefix.length).trim();
  }
  return null;
}

function findWorkspaceByText(args: {
  input: string;
  workspaces: StaveMuseWorkspaceSummary[];
}) {
  const query = normalizeSearch(args.input);
  return args.workspaces.find((workspace) => {
    const candidates = [
      workspace.name,
      workspace.branch ?? "",
      workspace.isDefault ? "default workspace" : "",
    ];
    return candidates.some((candidate) => normalizeSearch(candidate).includes(query));
  }) ?? null;
}

export function findStaveMuseWorkspaceMention(args: {
  input: string;
  workspaces: StaveMuseWorkspaceSummary[];
}) {
  const query = normalizeSearch(args.input);
  return args.workspaces.find((workspace) => {
    const candidates = [
      workspace.name,
      workspace.branch ?? "",
      workspace.isDefault ? "default workspace" : "",
      workspace.isDefault ? "기본 워크스페이스" : "",
    ];
    return candidates.some((candidate) => {
      const normalizedCandidate = normalizeSearch(candidate);
      return Boolean(normalizedCandidate) && query.includes(normalizedCandidate);
    });
  }) ?? null;
}

export function getStaveMuseRuntimeCwd() {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/\bWindows\b/i.test(userAgent)) {
    return "C:\\Windows\\Temp";
  }
  return "/tmp";
}

function findProjectByText(args: {
  input: string;
  projects: StaveMuseProjectSummary[];
}) {
  const query = normalizeSearch(args.input);
  return args.projects.find((project) => (
    normalizeSearch(project.projectName).includes(query)
    || normalizeSearch(project.projectPath).includes(query)
  )) ?? null;
}

function findTaskByText(args: {
  input: string;
  tasks: StaveMuseTaskSummary[];
}) {
  const query = normalizeSearch(args.input);
  return args.tasks.find((task) => normalizeSearch(task.title).includes(query)) ?? null;
}

function findTaskMentionInInput(args: {
  input: string;
  tasks: StaveMuseTaskSummary[];
}) {
  const query = normalizeSearch(args.input);
  return args.tasks.find((task) => {
    const title = normalizeSearch(task.title);
    return Boolean(title) && (query.includes(title) || query.includes(normalizeSearch(task.id)));
  }) ?? null;
}

function findTodoByText(args: {
  input: string;
  workspaceInformation: WorkspaceInformationState;
}) {
  const query = normalizeSearch(args.input);
  return args.workspaceInformation.todos.find((todo) => normalizeSearch(todo.text).includes(query)) ?? null;
}

function findCustomFieldByText(args: {
  input: string;
  workspaceInformation: WorkspaceInformationState;
}) {
  const query = normalizeSearch(args.input);
  return args.workspaceInformation.customFields.find((field) => normalizeSearch(field.label).includes(query)) ?? null;
}

function includesInCandidates(args: { query: string; candidates: string[] }) {
  return args.candidates.some((candidate) => normalizeSearch(candidate).includes(args.query));
}

function findJiraIssueByText(args: {
  input: string;
  workspaceInformation: WorkspaceInformationState;
}) {
  const query = normalizeSearch(args.input);
  return args.workspaceInformation.jiraIssues.find((issue) => includesInCandidates({
    query,
    candidates: [issue.issueKey, issue.title, issue.url, issue.status, issue.note],
  })) ?? null;
}

function findLinkedPullRequestByText(args: {
  input: string;
  workspaceInformation: WorkspaceInformationState;
}) {
  const query = normalizeSearch(args.input);
  return args.workspaceInformation.linkedPullRequests.find((pullRequest) => includesInCandidates({
    query,
    candidates: [pullRequest.title, pullRequest.url, pullRequest.status, pullRequest.note],
  })) ?? null;
}

function findConfluencePageByText(args: {
  input: string;
  workspaceInformation: WorkspaceInformationState;
}) {
  const query = normalizeSearch(args.input);
  return args.workspaceInformation.confluencePages.find((page) => includesInCandidates({
    query,
    candidates: [page.title, page.url, page.spaceKey, page.note],
  })) ?? null;
}

function findFigmaResourceByText(args: {
  input: string;
  workspaceInformation: WorkspaceInformationState;
}) {
  const query = normalizeSearch(args.input);
  return args.workspaceInformation.figmaResources.find((resource) => includesInCandidates({
    query,
    candidates: [resource.title, resource.url, resource.nodeId, resource.note],
  })) ?? null;
}

function findSlackThreadByText(args: {
  input: string;
  workspaceInformation: WorkspaceInformationState;
}) {
  const query = normalizeSearch(args.input);
  return args.workspaceInformation.slackThreads.find((thread) => includesInCandidates({
    query,
    candidates: [thread.channelName, thread.url, thread.note],
  })) ?? null;
}

function detectWorkspaceInfoFieldType(input: string): WorkspaceInfoFieldType | null {
  const normalized = normalizeSearch(input);
  for (const entry of INFO_FIELD_TYPE_ALIASES) {
    if (entry.aliases.some((alias) => normalized.includes(alias))) {
      return entry.value;
    }
  }
  return null;
}

function isTaskSelectionIntent(input: string) {
  return (input.includes("task") || input.includes("태스크"))
    && (
      input.includes("open")
      || input.includes("select")
      || input.includes("switch")
      || input.includes("activate")
      || input.includes("click")
      || input.includes("열")
      || input.includes("선택")
      || input.includes("활성")
      || input.includes("클릭")
    );
}

const STAVE_MUSE_WORKSPACE_INFO_LINK_PATTERNS = [
  /\b(add|save|register|link|attach|pin|store|remember)\b/i,
  /\b(add|put|save|register).*\b(information|info panel)\b/i,
  /\b(information|info panel).*\b(add|save|register|link|attach|pin)\b/i,
  /(추가|등록|저장|링크|붙여|고정|핀)/i,
  /(정보\s*패널|인포\s*패널).*(추가|등록|저장|링크|붙여|고정|핀)/i,
] as const;

const STAVE_MUSE_COMPLEX_WORKFLOW_PATTERNS = [
  /\b(read|summari[sz]e|analy[sz]e|create|update|edit|sync|draft|reply|triage|investigate)\b/i,
  /(읽|요약|분석|생성|만들|업데이트|수정|동기화|작성|답장|분류|조사)/i,
] as const;

function shouldResolveWorkspaceInfoLinkAction(args: {
  rawInput: string;
  urlMatch: string;
}) {
  const normalized = normalizeWhitespace(args.rawInput);
  if (!normalized) {
    return false;
  }
  if (normalized === args.urlMatch) {
    return true;
  }

  const explicitLinkIntent = STAVE_MUSE_WORKSPACE_INFO_LINK_PATTERNS.some((pattern) => pattern.test(normalized));
  if (!explicitLinkIntent) {
    return false;
  }

  return !STAVE_MUSE_COMPLEX_WORKFLOW_PATTERNS.some((pattern) => pattern.test(normalized));
}

function summarizeInformationState(info: WorkspaceInformationState) {
  return [
    `Latest turn summary: ${info.turnSummary ? "present" : "empty"}`,
    `Notes: ${info.notes.trim() ? "present" : "empty"}`,
    `Todos: ${info.todos.length}`,
    `Linked PRs: ${info.linkedPullRequests.length}`,
    `Jira: ${info.jiraIssues.length}`,
    `Confluence: ${info.confluencePages.length}`,
    `Figma: ${info.figmaResources.length}`,
    `Slack: ${info.slackThreads.length}`,
    `Custom fields: ${info.customFields.length}`,
  ].join("\n");
}

function formatMuseContextList(args: {
  label: string;
  items: string[];
  emptyLabel: string;
}) {
  if (args.items.length === 0) {
    return [`${args.label}:`, `- ${args.emptyLabel}`];
  }
  return [
    `${args.label}:`,
    ...args.items.map((item) => `- ${truncateMuseContextValue(item)}`),
  ];
}

function buildWorkspaceInformationDetailLines(info: WorkspaceInformationState) {
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
  const noteSummary = info.notes.trim()
    ? truncateMuseContextValue(info.notes, 320)
    : "empty";
  const todoItems = info.todos
    .slice(0, 5)
    .map((todo) => `${todo.completed ? "[done]" : "[open]"} ${todo.text}`);
  const jiraItems = info.jiraIssues
    .slice(0, 5)
    .map((issue) => [issue.issueKey || "Jira", issue.title, issue.status, issue.url]
      .filter((value) => value.trim().length > 0)
      .join(" | "));
  const confluenceItems = info.confluencePages
    .slice(0, 5)
    .map((page) => [page.title || "Confluence page", page.spaceKey, page.url]
      .filter((value) => value.trim().length > 0)
      .join(" | "));
  const figmaItems = info.figmaResources
    .slice(0, 5)
    .map((resource) => [
      resource.title || "Figma resource",
      resource.nodeId ? `node ${resource.nodeId}` : "",
      resource.url,
    ].filter((value) => value.trim().length > 0).join(" | "));
  const slackItems = info.slackThreads
    .slice(0, 5)
    .map((thread) => [thread.channelName || "Slack thread", thread.url]
      .filter((value) => value.trim().length > 0)
      .join(" | "));
  const customFieldItems = info.customFields
    .slice(0, 8)
    .map((field) => {
      const value = field.type === "single_select"
        ? field.value || "(empty)"
        : field.type === "boolean"
          ? String(field.value)
          : field.type === "number"
            ? (field.value == null ? "(empty)" : String(field.value))
            : field.value.trim() || "(empty)";
      return `${field.label} = ${value}`;
    });

  return [
    ...formatMuseContextList({
      label: "Latest turn summary",
      items: turnSummaryItems,
      emptyLabel: "none",
    }),
    ...formatMuseContextList({
      label: "Notes",
      items: [noteSummary],
      emptyLabel: "empty",
    }),
    ...formatMuseContextList({
      label: "Todos",
      items: todoItems,
      emptyLabel: "none",
    }),
    ...formatMuseContextList({
      label: "Jira issues",
      items: jiraItems,
      emptyLabel: "none",
    }),
    ...formatMuseContextList({
      label: "Confluence pages",
      items: confluenceItems,
      emptyLabel: "none",
    }),
    ...formatMuseContextList({
      label: "Figma resources",
      items: figmaItems,
      emptyLabel: "none",
    }),
    ...formatMuseContextList({
      label: "Slack threads",
      items: slackItems,
      emptyLabel: "none",
    }),
    ...formatMuseContextList({
      label: "Custom fields",
      items: customFieldItems,
      emptyLabel: "none",
    }),
  ];
}

export function buildStaveMuseContextSnapshot(args: {
  target: StaveMuseTarget;
  context: StaveMuseLocalActionContext;
}) {
  const scopeLabel = formatStaveMuseTargetLabel({ target: args.target });
  const currentProjectLabel = args.context.projectPath
    ? `${args.context.projectName ?? "Current project"} (\`${args.context.projectPath}\`)`
    : "No project open";
  const workspaceLines = args.context.workspaces.length > 0
    ? args.context.workspaces.map((workspace) => (
      `- ${workspace.isActive ? "[active] " : ""}${workspace.name}${workspace.branch ? ` (${workspace.branch})` : ""}`
    ))
    : ["- No workspaces"];
  const taskLines = args.context.tasks.length > 0
    ? args.context.tasks.slice(0, 8).map((task) => (
      `- ${task.isActive ? "[active] " : ""}${task.title}${task.isResponding ? " [running]" : ""}`
    ))
    : ["- No tasks"];

  return [
    `Stave Muse scope: ${scopeLabel}`,
    "",
    `Current project: ${currentProjectLabel}`,
    "",
    "Workspaces:",
    ...workspaceLines,
    "",
    "Tasks:",
    ...taskLines,
    "",
    "Workspace Information Summary:",
    summarizeInformationState(args.context.workspaceInformation),
    "",
    "Workspace Information Details:",
    ...buildWorkspaceInformationDetailLines(args.context.workspaceInformation),
  ].join("\n");
}

export function formatStaveMuseTargetLabel(args: {
  target: StaveMuseTarget;
}) {
  switch (args.target.kind) {
    case "app":
      return "App";
    case "workspace":
      return "Current Workspace";
    case "project":
    default:
      return "Current Project";
  }
}

export function createEmptyStaveMuseState(args?: {
  defaultTarget?: StaveMuseDefaultTarget;
}): StaveMuseState {
  const defaultTarget = args?.defaultTarget ?? "app";
  const target: StaveMuseTarget = {
    kind: defaultTarget === "app"
      ? "app"
      : defaultTarget === "current-workspace"
        ? "workspace"
        : "project",
  };

  return {
    open: false,
    target,
    messages: [],
    promptDraft: EMPTY_PROMPT_DRAFT,
    providerSession: undefined,
    nativeSessionReady: false,
    focusNonce: 0,
  };
}

export function buildStaveMuseSummaryResponse(args: {
  target: StaveMuseTarget;
  context: StaveMuseLocalActionContext;
}) {
  const lines: string[] = [];
  lines.push(`Scope: ${formatStaveMuseTargetLabel({ target: args.target })}`);
  lines.push(`Project: ${args.context.projectName ?? "No project open"}`);
  if (args.context.projectPath) {
    lines.push(`Path: \`${args.context.projectPath}\``);
  }
  lines.push(`Workspaces: ${args.context.workspaces.length}`);
  lines.push(`Tasks: ${args.context.tasks.length}`);
  lines.push(`Active task: ${args.context.tasks.find((task) => task.isActive)?.title ?? "None"}`);
  lines.push("");
  lines.push(summarizeInformationState(args.context.workspaceInformation));
  return lines.join("\n");
}

export function resolveStaveMuseLocalAction(args: {
  input: string;
  context: StaveMuseLocalActionContext;
  allowDirectWorkspaceInfoEdits: boolean;
}): StaveMuseLocalAction | null {
  const raw = normalizeWhitespace(args.input);
  const input = raw.toLowerCase();

  if (!input) {
    return null;
  }

  if (
    input === "status"
    || input === "summary"
    || input.includes("summarize stave")
    || input.includes("stave status")
    || input.includes("현재 상태")
    || input.includes("요약")
  ) {
    return { kind: "show_summary" };
  }

  if (input.includes("information summary") || input.includes("summarize information") || input.includes("정보 패널 요약")) {
    return { kind: "show_information_summary" };
  }

  if (input.includes("open settings") || input.includes("settings 열")) {
    return { kind: "open_settings" };
  }

  if (input.includes("open information") || input.includes("show information") || input.includes("정보 패널 열")) {
    return { kind: "toggle_information_panel", open: true };
  }
  if (input.includes("close information") || input.includes("hide information") || input.includes("정보 패널 닫")) {
    return { kind: "toggle_information_panel", open: false };
  }
  if (input.includes("open changes") || input.includes("show changes") || input.includes("변경 패널 열")) {
    return { kind: "toggle_changes_panel", open: true };
  }
  if (input.includes("close changes") || input.includes("hide changes") || input.includes("변경 패널 닫")) {
    return { kind: "toggle_changes_panel", open: false };
  }
  if (input.includes("open explorer") || input.includes("show explorer") || input.includes("탐색기 열")) {
    return { kind: "toggle_explorer_panel", open: true };
  }
  if (input.includes("close explorer") || input.includes("hide explorer") || input.includes("탐색기 닫")) {
    return { kind: "toggle_explorer_panel", open: false };
  }
  if (input.includes("open scripts") || input.includes("show scripts") || input.includes("scripts 패널 열") || input.includes("스크립트 패널 열")) {
    return { kind: "toggle_scripts_panel", open: true };
  }
  if (input.includes("close scripts") || input.includes("hide scripts") || input.includes("scripts 패널 닫") || input.includes("스크립트 패널 닫")) {
    return { kind: "toggle_scripts_panel", open: false };
  }
  if (input.includes("open editor") || input.includes("show editor") || input.includes("에디터 열")) {
    return { kind: "toggle_editor", open: true };
  }
  if (input.includes("close editor") || input.includes("hide editor") || input.includes("에디터 닫")) {
    return { kind: "toggle_editor", open: false };
  }
  if (input.includes("open terminal") || input.includes("show terminal") || input.includes("터미널 열")) {
    return { kind: "toggle_terminal", open: true };
  }
  if (input.includes("close terminal") || input.includes("hide terminal") || input.includes("터미널 닫")) {
    return { kind: "toggle_terminal", open: false };
  }
  if (input.includes("collapse sidebar") || input.includes("hide sidebar") || input.includes("사이드바 접")) {
    return { kind: "toggle_workspace_sidebar", open: false };
  }
  if (input.includes("expand sidebar") || input.includes("show sidebar") || input.includes("사이드바 펼")) {
    return { kind: "toggle_workspace_sidebar", open: true };
  }

  const workspaceTarget = extractTrailingValue({
    input: raw,
    prefixes: ["switch workspace ", "open workspace ", "select workspace ", "workspace ", "워크스페이스 "],
  });
  if (workspaceTarget) {
    const workspace = findWorkspaceByText({
      input: workspaceTarget.replace(/^(to|열기|선택)\s+/i, ""),
      workspaces: args.context.workspaces,
    });
    if (workspace) {
      return {
        kind: "switch_workspace",
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      };
    }
  }

  const projectTarget = extractTrailingValue({
    input: raw,
    prefixes: ["open project ", "switch project ", "project ", "프로젝트 "],
  });
  if (projectTarget) {
    const project = findProjectByText({
      input: projectTarget.replace(/^(to|열기|전환)\s+/i, ""),
      projects: args.context.projects,
    });
    if (project) {
      return {
        kind: "open_project",
        projectPath: project.projectPath,
        projectName: project.projectName,
      };
    }
  }

  const createTaskValue = extractTrailingValue({
    input: raw,
    prefixes: ["create task ", "new task ", "task 만들어 ", "새 task ", "새 태스크 ", "create a task "],
  });
  if (createTaskValue) {
    return {
      kind: "create_task",
      title: createTaskValue.replace(/^["']|["']$/g, "").trim() || "New Task",
    };
  }

  const selectTaskValue = extractTrailingValue({
    input: raw,
    prefixes: ["select task ", "open task ", "switch task ", "task ", "태스크 "],
  });
  if (selectTaskValue) {
    const task = findTaskByText({
      input: selectTaskValue.replace(/^(to|열기|선택)\s+/i, ""),
      tasks: args.context.tasks,
    });
    if (task) {
      return {
        kind: "select_task",
        taskId: task.id,
        taskTitle: task.title,
      };
    }
  }

  if (isTaskSelectionIntent(input)) {
    const task = findTaskMentionInInput({
      input: quoteWrapped(raw) ?? raw,
      tasks: args.context.tasks,
    });
    if (task) {
      return {
        kind: "select_task",
        taskId: task.id,
        taskTitle: task.title,
      };
    }
  }

  if (!args.allowDirectWorkspaceInfoEdits) {
    return null;
  }

  const urlMatch = raw.match(/https?:\/\/\S+/i)?.[0];
  if (urlMatch && shouldResolveWorkspaceInfoLinkAction({ rawInput: raw, urlMatch })) {
    const jira = extractJiraIssueReference(urlMatch);
    if (jira) {
      return { kind: "add_jira_link", url: urlMatch, issueKey: jira.issueKey };
    }
    const pr = extractGitHubPullRequestReference(urlMatch);
    if (pr) {
      return { kind: "add_pull_request_link", url: urlMatch, title: `${pr.owner}/${pr.repo}#${pr.number}` };
    }
    const confluence = extractConfluencePageReference(urlMatch);
    if (confluence) {
      return { kind: "add_confluence_link", url: urlMatch, title: confluence.title || confluence.spaceKey || "Confluence page" };
    }
    const figma = extractFigmaResourceReference(urlMatch);
    if (figma) {
      return {
        kind: "add_figma_link",
        url: urlMatch,
        title: figma.title || figma.fileKey,
        nodeId: figma.nodeId ?? "",
      };
    }
    const slack = extractSlackThreadReference(urlMatch);
    if (slack) {
      return {
        kind: "add_slack_link",
        url: urlMatch,
        channelName: slack.channelId,
      };
    }
  }

  const noteValue = extractTrailingValue({
    input: raw,
    prefixes: ["set note ", "replace note ", "note ", "노트 ", "메모 "],
  });
  if (noteValue) {
    const normalized = noteValue.replace(/^(to|with)\s+/i, "").trim();
    if (normalized.toLowerCase() === "clear" || normalized === "비우기") {
      return { kind: "clear_notes" };
    }
    return { kind: "replace_notes", text: normalized };
  }

  const appendNoteValue = extractTrailingValue({
    input: raw,
    prefixes: ["append note ", "add note ", "note append ", "노트 추가 ", "메모 추가 "],
  });
  if (appendNoteValue) {
    return { kind: "append_notes", text: appendNoteValue.trim() };
  }

  const addTodoValue = extractTrailingValue({
    input: raw,
    prefixes: ["add todo ", "create todo ", "todo ", "할일 추가 ", "todo 추가 "],
  });
  if (addTodoValue) {
    return { kind: "add_todo", text: addTodoValue.replace(/^(to|item)\s+/i, "").trim() };
  }

  const completeTodoValue = extractTrailingValue({
    input: raw,
    prefixes: ["complete todo ", "finish todo ", "done todo ", "todo 완료 ", "할일 완료 "],
  });
  if (completeTodoValue) {
    const todo = findTodoByText({
      input: completeTodoValue,
      workspaceInformation: args.context.workspaceInformation,
    });
    if (todo) {
      return { kind: "complete_todo", todoId: todo.id, todoText: todo.text };
    }
  }

  const deleteTodoValue = extractTrailingValue({
    input: raw,
    prefixes: ["delete todo ", "remove todo ", "todo 삭제 ", "할일 삭제 "],
  });
  if (deleteTodoValue) {
    const todo = findTodoByText({
      input: deleteTodoValue,
      workspaceInformation: args.context.workspaceInformation,
    });
    if (todo) {
      return { kind: "delete_todo", todoId: todo.id, todoText: todo.text };
    }
  }

  const removeJiraValue = extractTrailingValue({
    input: raw,
    prefixes: ["remove jira ", "delete jira ", "jira 삭제 ", "jira remove "],
  });
  if (removeJiraValue) {
    const issue = findJiraIssueByText({
      input: removeJiraValue,
      workspaceInformation: args.context.workspaceInformation,
    });
    if (issue) {
      return {
        kind: "remove_jira_link",
        linkId: issue.id,
        issueKey: issue.issueKey || issue.title || "Jira issue",
      };
    }
  }

  const removePullRequestValue = extractTrailingValue({
    input: raw,
    prefixes: ["remove pull request ", "delete pull request ", "remove pr ", "delete pr ", "pr 삭제 "],
  });
  if (removePullRequestValue) {
    const pullRequest = findLinkedPullRequestByText({
      input: removePullRequestValue,
      workspaceInformation: args.context.workspaceInformation,
    });
    if (pullRequest) {
      return {
        kind: "remove_pull_request_link",
        linkId: pullRequest.id,
        title: pullRequest.title || "Linked pull request",
      };
    }
  }

  const removeConfluenceValue = extractTrailingValue({
    input: raw,
    prefixes: ["remove confluence ", "delete confluence ", "confluence 삭제 "],
  });
  if (removeConfluenceValue) {
    const page = findConfluencePageByText({
      input: removeConfluenceValue,
      workspaceInformation: args.context.workspaceInformation,
    });
    if (page) {
      return {
        kind: "remove_confluence_link",
        linkId: page.id,
        title: page.title || "Confluence page",
      };
    }
  }

  const removeFigmaValue = extractTrailingValue({
    input: raw,
    prefixes: ["remove figma ", "delete figma ", "figma 삭제 "],
  });
  if (removeFigmaValue) {
    const resource = findFigmaResourceByText({
      input: removeFigmaValue,
      workspaceInformation: args.context.workspaceInformation,
    });
    if (resource) {
      return {
        kind: "remove_figma_link",
        linkId: resource.id,
        title: resource.title || "Figma resource",
      };
    }
  }

  const removeSlackValue = extractTrailingValue({
    input: raw,
    prefixes: ["remove slack ", "delete slack ", "slack 삭제 "],
  });
  if (removeSlackValue) {
    const thread = findSlackThreadByText({
      input: removeSlackValue,
      workspaceInformation: args.context.workspaceInformation,
    });
    if (thread) {
      return {
        kind: "remove_slack_link",
        linkId: thread.id,
        channelName: thread.channelName || "Slack thread",
      };
    }
  }

  if (input.startsWith("add field ") || input.startsWith("create field ") || input.startsWith("필드 추가 ")) {
    const label = quoteWrapped(raw) ?? raw.replace(/^(add|create)\s+field\s+/i, "").replace(/^필드 추가\s+/i, "");
    const fieldType = detectWorkspaceInfoFieldType(raw) ?? "text";
    const normalizedLabel = label
      .replace(/\s+as\s+.+$/i, "")
      .replace(/\s+type\s+.+$/i, "")
      .trim();
    if (normalizedLabel) {
      const template = createWorkspaceInfoCustomField({ type: fieldType, label: normalizedLabel });
      return { kind: "add_custom_field", fieldType: template.type, label: template.label };
    }
  }

  if (input.startsWith("set field ") || input.startsWith("update field ") || input.startsWith("필드 설정 ")) {
    const label = quoteWrapped(raw);
    const field = label
      ? findCustomFieldByText({
          input: label,
          workspaceInformation: args.context.workspaceInformation,
        })
      : null;
    const valueMatch = raw.match(/\bto\b\s+(.+)$/i) ?? raw.match(/값\s+(.+)$/i);
    if (field && valueMatch?.[1]?.trim()) {
      return {
        kind: "set_custom_field",
        fieldId: field.id,
        fieldLabel: field.label,
        value: valueMatch[1].trim(),
      };
    }
  }

  return null;
}

export function buildStaveMuseLocalActionResponse(args: {
  action: StaveMuseLocalAction;
  context: StaveMuseLocalActionContext;
}) {
  switch (args.action.kind) {
    case "show_summary":
      return buildStaveMuseSummaryResponse({
        target: { kind: "app" },
        context: args.context,
      });
    case "show_information_summary":
      return summarizeInformationState(args.context.workspaceInformation);
    case "open_settings":
      return "Opened Settings.";
    case "toggle_information_panel":
      return args.action.open === false ? "Closed the Information panel." : "Opened the Information panel.";
    case "toggle_changes_panel":
      return args.action.open === false ? "Closed the Changes panel." : "Opened the Changes panel.";
    case "toggle_explorer_panel":
      return args.action.open === false ? "Closed the Explorer panel." : "Opened the Explorer panel.";
    case "toggle_scripts_panel":
      return args.action.open === false ? "Closed the Scripts panel." : "Opened the Scripts panel.";
    case "toggle_editor":
      return args.action.open === false ? "Closed the editor." : "Opened the editor.";
    case "toggle_terminal":
      return args.action.open === false ? "Closed the terminal." : "Opened the terminal.";
    case "toggle_workspace_sidebar":
      return args.action.open === false ? "Collapsed the workspace sidebar." : "Expanded the workspace sidebar.";
    case "switch_workspace":
      return `Switched to workspace: ${args.action.workspaceName}.`;
    case "open_project":
      return `Opened project: ${args.action.projectName}.`;
    case "create_task":
      return `Created a new task: ${args.action.title}.`;
    case "select_task":
      return `Selected task: ${args.action.taskTitle}.`;
    case "replace_notes":
      return "Replaced workspace notes.";
    case "append_notes":
      return "Appended to workspace notes.";
    case "clear_notes":
      return "Cleared workspace notes.";
    case "add_todo":
      return `Added todo: ${args.action.text}.`;
    case "complete_todo":
      return `Completed todo: ${args.action.todoText}.`;
    case "delete_todo":
      return `Deleted todo: ${args.action.todoText}.`;
    case "add_jira_link":
      return `Added Jira link: ${args.action.issueKey}.`;
    case "remove_jira_link":
      return `Removed Jira link: ${args.action.issueKey}.`;
    case "add_pull_request_link":
      return `Added linked pull request: ${args.action.title}.`;
    case "remove_pull_request_link":
      return `Removed linked pull request: ${args.action.title}.`;
    case "add_confluence_link":
      return `Added Confluence page: ${args.action.title}.`;
    case "remove_confluence_link":
      return `Removed Confluence page: ${args.action.title}.`;
    case "add_figma_link":
      return `Added Figma resource: ${args.action.title}.`;
    case "remove_figma_link":
      return `Removed Figma resource: ${args.action.title}.`;
    case "add_slack_link":
      return `Added Slack thread: ${args.action.channelName}.`;
    case "remove_slack_link":
      return `Removed Slack thread: ${args.action.channelName}.`;
    case "add_custom_field":
      return `Added custom field: ${args.action.label}.`;
    case "set_custom_field":
      return `Updated custom field: ${args.action.fieldLabel}.`;
  }
}
