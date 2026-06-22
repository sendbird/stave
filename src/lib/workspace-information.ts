export const WORKSPACE_INFO_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "boolean",
  "date",
  "url",
  "single_select",
] as const;

export type WorkspaceInfoFieldType =
  (typeof WORKSPACE_INFO_FIELD_TYPES)[number];

export const WORKSPACE_LINKED_PR_STATUSES = [
  "planned",
  "open",
  "review",
  "merged",
  "closed",
] as const;

export type WorkspaceLinkedPrStatus =
  (typeof WORKSPACE_LINKED_PR_STATUSES)[number];

export interface GitHubPullRequestReference {
  owner: string;
  repo: string;
  number: number;
}

export interface JiraIssueReference {
  host: string;
  issueKey: string;
}

export type FigmaResourceKind =
  | "file"
  | "design"
  | "proto"
  | "board"
  | "slides"
  | "unknown";

export interface FigmaResourceReference {
  host: string;
  kind: FigmaResourceKind;
  fileKey: string;
  title: string;
  nodeId: string | null;
}

export interface WorkspaceJiraIssue {
  id: string;
  issueKey: string;
  title: string;
  url: string;
  status: string;
  note: string;
}

export interface WorkspaceFigmaResource {
  id: string;
  title: string;
  url: string;
  nodeId: string;
  note: string;
}

export const STORYBOOK_ACCESS_KINDS = [
  "unknown",
  "public",
  "requires_github_auth",
] as const;

export type WorkspaceStorybookAccessKind =
  (typeof STORYBOOK_ACCESS_KINDS)[number];

export const STORYBOOK_ACCESS_PROVIDERS = [
  "unknown",
  "github-pages",
  "web",
] as const;

export type WorkspaceStorybookAccessProvider =
  (typeof STORYBOOK_ACCESS_PROVIDERS)[number];

export const STORYBOOK_READABLE_VIA = ["unknown", "web", "github_cli"] as const;

export type WorkspaceStorybookReadableVia =
  (typeof STORYBOOK_READABLE_VIA)[number];

export interface WorkspaceStorybookResourceAccess {
  kind: WorkspaceStorybookAccessKind;
  provider: WorkspaceStorybookAccessProvider;
  externalRepo: string;
  readableVia: WorkspaceStorybookReadableVia;
  sourceHint: string;
}

export interface WorkspaceStorybookResource {
  id: string;
  title: string;
  url: string;
  note: string;
  access?: WorkspaceStorybookResourceAccess;
}

export interface WorkspaceLinkedPullRequest {
  id: string;
  title: string;
  url: string;
  status: WorkspaceLinkedPrStatus;
  note: string;
}

export interface WorkspaceSlackThread {
  id: string;
  url: string;
  channelName: string;
  note: string;
}

export interface WorkspaceConfluencePage {
  id: string;
  title: string;
  url: string;
  spaceKey: string;
  note: string;
}

export type WorkspaceTodoStatus = "pending" | "in_progress" | "completed";

export const WORKSPACE_TODO_STATUSES: readonly WorkspaceTodoStatus[] = [
  "pending",
  "in_progress",
  "completed",
];

export interface WorkspaceTodoItem {
  id: string;
  text: string;
  /** Legacy mirror of `status === "completed"`, kept for backward compatibility. */
  completed: boolean;
  status?: WorkspaceTodoStatus;
}

/** Resolve the effective 3-state status, falling back to the legacy `completed` flag. */
export function resolveWorkspaceTodoStatus(
  todo: Pick<WorkspaceTodoItem, "status" | "completed">,
): WorkspaceTodoStatus {
  if (todo.status) {
    return todo.status;
  }
  return todo.completed ? "completed" : "pending";
}

/** Apply a status to a todo, keeping the legacy `completed` flag in sync. */
export function applyWorkspaceTodoStatus(
  todo: WorkspaceTodoItem,
  status: WorkspaceTodoStatus,
): WorkspaceTodoItem {
  return { ...todo, status, completed: status === "completed" };
}

/** Cycle pending -> in_progress -> completed -> pending. */
export function cycleWorkspaceTodoStatus(
  status: WorkspaceTodoStatus,
): WorkspaceTodoStatus {
  return status === "pending"
    ? "in_progress"
    : status === "in_progress"
      ? "completed"
      : "pending";
}

export interface WorkspaceTurnSummary {
  turnId: string;
  taskId: string;
  taskTitle: string;
  generatedAt: string;
  model: string;
  requestSummary: string;
  workSummary: string;
}

interface WorkspaceInfoFieldBase {
  id: string;
  label: string;
}

export interface WorkspaceTextField extends WorkspaceInfoFieldBase {
  type: "text";
  value: string;
}

export interface WorkspaceTextareaField extends WorkspaceInfoFieldBase {
  type: "textarea";
  value: string;
}

export interface WorkspaceNumberField extends WorkspaceInfoFieldBase {
  type: "number";
  value: number | null;
}

export interface WorkspaceBooleanField extends WorkspaceInfoFieldBase {
  type: "boolean";
  value: boolean;
}

export interface WorkspaceDateField extends WorkspaceInfoFieldBase {
  type: "date";
  value: string;
}

export interface WorkspaceUrlField extends WorkspaceInfoFieldBase {
  type: "url";
  value: string;
}

export interface WorkspaceSingleSelectField extends WorkspaceInfoFieldBase {
  type: "single_select";
  value: string;
  options: string[];
}

export type WorkspaceInfoCustomField =
  | WorkspaceTextField
  | WorkspaceTextareaField
  | WorkspaceNumberField
  | WorkspaceBooleanField
  | WorkspaceDateField
  | WorkspaceUrlField
  | WorkspaceSingleSelectField;

export interface WorkspaceInformationState {
  jiraIssues: WorkspaceJiraIssue[];
  confluencePages: WorkspaceConfluencePage[];
  figmaResources: WorkspaceFigmaResource[];
  storybookResources: WorkspaceStorybookResource[];
  linkedPullRequests: WorkspaceLinkedPullRequest[];
  slackThreads: WorkspaceSlackThread[];
  turnSummary?: WorkspaceTurnSummary | null;
  notes: string;
  todos: WorkspaceTodoItem[];
  customFields: WorkspaceInfoCustomField[];
}

function buildWorkspaceInformationId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createWorkspaceJiraIssue(): WorkspaceJiraIssue {
  return {
    id: buildWorkspaceInformationId("jira"),
    issueKey: "",
    title: "",
    url: "",
    status: "",
    note: "",
  };
}

export function createWorkspaceFigmaResource(): WorkspaceFigmaResource {
  return {
    id: buildWorkspaceInformationId("figma"),
    title: "",
    url: "",
    nodeId: "",
    note: "",
  };
}

export function createWorkspaceStorybookResource(): WorkspaceStorybookResource {
  return {
    id: buildWorkspaceInformationId("storybook"),
    title: "",
    url: "",
    note: "",
  };
}

export function createWorkspaceLinkedPullRequest(): WorkspaceLinkedPullRequest {
  return {
    id: buildWorkspaceInformationId("pr"),
    title: "",
    url: "",
    status: "planned",
    note: "",
  };
}

export function createWorkspaceSlackThread(): WorkspaceSlackThread {
  return {
    id: buildWorkspaceInformationId("slack"),
    url: "",
    channelName: "",
    note: "",
  };
}

export function createWorkspaceConfluencePage(): WorkspaceConfluencePage {
  return {
    id: buildWorkspaceInformationId("confluence"),
    title: "",
    url: "",
    spaceKey: "",
    note: "",
  };
}

export function createWorkspaceTodoItem(): WorkspaceTodoItem {
  return {
    id: buildWorkspaceInformationId("todo"),
    text: "",
    completed: false,
    status: "pending",
  };
}

export function parseWorkspaceInfoOptions(rawValue: string) {
  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(
      (item, index, array) => item.length > 0 && array.indexOf(item) === index,
    );
}

function parseWorkspaceInfoUrl(value: string) {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

export function isWorkspaceInfoUrl(value: string) {
  const url = parseWorkspaceInfoUrl(value);
  if (!url) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

export function formatWorkspaceInfoHostLabel(value: string) {
  const url = parseWorkspaceInfoUrl(value);
  if (!url) {
    return "";
  }
  return url.hostname.replace(/^www\./, "");
}

export function extractGitHubPullRequestReference(
  value: string,
): GitHubPullRequestReference | null {
  const url = parseWorkspaceInfoUrl(value);
  if (!url || url.hostname.replace(/^www\./, "") !== "github.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if ((segments[2] ?? "") !== "pull") {
    return null;
  }

  const owner = segments[0] ?? "";
  const repo = segments[1] ?? "";
  const number = Number.parseInt(segments[3] ?? "", 10);
  if (!owner || !repo || !Number.isInteger(number) || number < 1) {
    return null;
  }

  return { owner, repo, number };
}

export function isGitHubPullRequestUrl(value: string) {
  return extractGitHubPullRequestReference(value) !== null;
}

export function extractJiraIssueReference(
  value: string,
): JiraIssueReference | null {
  const url = parseWorkspaceInfoUrl(value);
  if (!url) {
    return null;
  }

  const match =
    `${decodeURIComponent(url.pathname)} ${decodeURIComponent(url.search)}`.match(
      /\b([A-Z][A-Z0-9]+-\d+)\b/,
    );
  const issueKey = match?.[1]?.trim();
  if (!issueKey) {
    return null;
  }

  return {
    host: formatWorkspaceInfoHostLabel(value),
    issueKey,
  };
}

export function extractFigmaResourceReference(
  value: string,
): FigmaResourceReference | null {
  const url = parseWorkspaceInfoUrl(value);
  if (!url || url.hostname.replace(/^www\./, "") !== "figma.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const rawKind = segments[0] ?? "";
  const kind: FigmaResourceKind =
    rawKind === "file" ||
    rawKind === "design" ||
    rawKind === "proto" ||
    rawKind === "board" ||
    rawKind === "slides"
      ? rawKind
      : "unknown";
  const fileKey = segments[1] ?? "";
  if (!fileKey) {
    return null;
  }

  const title = decodeURIComponent(segments[2] ?? "")
    .replace(/[-_]+/g, " ")
    .trim();
  const nodeId = url.searchParams.get("node-id")?.trim() || null;

  return {
    host: formatWorkspaceInfoHostLabel(value),
    kind,
    fileKey,
    title,
    nodeId,
  };
}

export interface StorybookResourceReference {
  host: string;
  storyPath: string;
  title: string;
}

export function extractStorybookResourceReference(
  value: string,
): StorybookResourceReference | null {
  const url = parseWorkspaceInfoUrl(value);
  if (!url) {
    return null;
  }

  const storyPath = url.searchParams.get("path")?.trim() ?? "";
  const rawTitle = storyPath || decodeURIComponent(url.pathname).trim();
  const title = rawTitle
    .replace(/^\/?(story|docs)\//, "")
    .replace(/--docs$/, "")
    .replace(/[\/_-]+/g, " ")
    .trim();

  return {
    host: formatWorkspaceInfoHostLabel(value),
    storyPath,
    title,
  };
}

export function normalizeGitHubRepoReference(value?: string | null) {
  const rawValue = value?.trim() ?? "";
  if (!rawValue) {
    return "";
  }

  const normalizedValue = rawValue.replace(/\.git$/, "");
  const parsedUrl = parseWorkspaceInfoUrl(normalizedValue);
  const pathValue =
    parsedUrl?.hostname.replace(/^www\./, "") === "github.com"
      ? parsedUrl.pathname
      : normalizedValue.replace(/^https?:\/\/(?:www\.)?github\.com\//, "");
  const segments = pathValue.replace(/^\/+/, "").split("/").filter(Boolean);
  const owner = segments[0]?.trim() ?? "";
  const repo = segments[1]?.trim() ?? "";
  if (!owner || !repo) {
    return rawValue;
  }

  return `${owner}/${repo}`;
}

function isWorkspaceStorybookAccessKind(
  value?: string | null,
): value is WorkspaceStorybookAccessKind {
  return STORYBOOK_ACCESS_KINDS.includes(value as WorkspaceStorybookAccessKind);
}

function isWorkspaceStorybookReadableVia(
  value?: string | null,
): value is WorkspaceStorybookReadableVia {
  return STORYBOOK_READABLE_VIA.includes(
    value as WorkspaceStorybookReadableVia,
  );
}

function normalizeStorybookAccessKind(
  value?: string | null,
): WorkspaceStorybookAccessKind | undefined {
  const normalized = value?.trim();
  return isWorkspaceStorybookAccessKind(normalized) ? normalized : undefined;
}

function normalizeStorybookReadableVia(
  value?: string | null,
): WorkspaceStorybookReadableVia | undefined {
  const normalized = value?.trim();
  return isWorkspaceStorybookReadableVia(normalized) ? normalized : undefined;
}

export function inferStorybookResourceAccess(
  value: string,
): WorkspaceStorybookResourceAccess | undefined {
  const url = parseWorkspaceInfoUrl(value);
  if (!url) {
    return undefined;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host.endsWith(".pages.github.io")) {
    return {
      kind: "requires_github_auth",
      provider: "github-pages",
      externalRepo: "",
      readableVia: "github_cli",
      sourceHint: "",
    };
  }

  if (host.endsWith(".github.io")) {
    return {
      kind: "unknown",
      provider: "github-pages",
      externalRepo: "",
      readableVia: "unknown",
      sourceHint: "",
    };
  }

  return undefined;
}

export function resolveStorybookResourceAccess(args: {
  url: string;
  accessKind?: string | null;
  externalRepo?: string | null;
  readableVia?: string | null;
  sourceHint?: string | null;
}): WorkspaceStorybookResourceAccess | undefined {
  const inferred = inferStorybookResourceAccess(args.url);
  const externalRepo = normalizeGitHubRepoReference(args.externalRepo);
  const sourceHint = args.sourceHint?.trim() ?? "";
  const kind = normalizeStorybookAccessKind(args.accessKind) ?? inferred?.kind;
  const readableVia =
    normalizeStorybookReadableVia(args.readableVia) ??
    (externalRepo ? "github_cli" : inferred?.readableVia);

  if (!kind && !externalRepo && !readableVia && !sourceHint && !inferred) {
    return undefined;
  }

  return {
    kind: kind ?? "unknown",
    provider: inferred?.provider ?? (externalRepo ? "github-pages" : "unknown"),
    externalRepo,
    readableVia: readableVia ?? "unknown",
    sourceHint,
  };
}

export function formatStorybookAccessContext(
  resource: WorkspaceStorybookResource,
) {
  const access =
    resource.access ?? inferStorybookResourceAccess(resource.url) ?? null;
  if (!access) {
    return "";
  }

  const parts = [
    access.kind === "requires_github_auth"
      ? "access requires GitHub auth"
      : access.kind === "public"
        ? "access public"
        : "access unknown",
    access.provider !== "unknown" ? `provider ${access.provider}` : "",
    access.externalRepo ? `repo ${access.externalRepo}` : "",
    access.readableVia === "github_cli"
      ? "read via GitHub CLI/API instead of direct web fetch"
      : access.readableVia === "web"
        ? "read via web fetch"
        : "",
    access.sourceHint ? `source ${access.sourceHint}` : "",
  ].filter((value) => value.length > 0);

  return parts.join(", ");
}

export function createWorkspaceInfoCustomField(args?: {
  type?: WorkspaceInfoFieldType;
  label?: string;
}): WorkspaceInfoCustomField {
  const type = args?.type ?? "text";
  const label = args?.label?.trim() ?? "";
  const id = buildWorkspaceInformationId("field");

  switch (type) {
    case "textarea":
      return { id, label, type, value: "" };
    case "number":
      return { id, label, type, value: null };
    case "boolean":
      return { id, label, type, value: false };
    case "date":
      return { id, label, type, value: "" };
    case "url":
      return { id, label, type, value: "" };
    case "single_select":
      return { id, label, type, value: "", options: [] };
    case "text":
    default:
      return { id, label, type: "text", value: "" };
  }
}

export function changeWorkspaceInfoCustomFieldType(args: {
  field: WorkspaceInfoCustomField;
  type: WorkspaceInfoFieldType;
}): WorkspaceInfoCustomField {
  const { field, type } = args;
  const nextField = createWorkspaceInfoCustomField({
    type,
    label: field.label,
  });

  return {
    ...nextField,
    id: field.id,
  };
}

export function updateWorkspaceInfoSelectFieldOptions(args: {
  field: WorkspaceSingleSelectField;
  rawValue: string;
}): WorkspaceSingleSelectField {
  const options = parseWorkspaceInfoOptions(args.rawValue);
  const nextValue = options.includes(args.field.value)
    ? args.field.value
    : (options[0] ?? "");

  return {
    ...args.field,
    options,
    value: nextValue,
  };
}

export interface SlackThreadReference {
  host: string;
  channelId: string;
}

export function extractSlackThreadReference(
  value: string,
): SlackThreadReference | null {
  const url = parseWorkspaceInfoUrl(value);
  if (!url || !url.hostname.endsWith("slack.com")) {
    return null;
  }

  // https://yourteam.slack.com/archives/C12345678/p1234567890
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "archives" || !segments[1]) {
    return null;
  }

  return {
    host: formatWorkspaceInfoHostLabel(value),
    channelId: segments[1],
  };
}

export function isSlackThreadUrl(value: string) {
  return extractSlackThreadReference(value) !== null;
}

export interface ConfluencePageReference {
  host: string;
  spaceKey: string;
  title: string;
}

export function extractConfluencePageReference(
  value: string,
): ConfluencePageReference | null {
  const url = parseWorkspaceInfoUrl(value);
  if (!url || !url.hostname.endsWith("atlassian.net")) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);

  // Pattern: /wiki/spaces/SPACE/pages/12345/Page+Title
  if (segments[0] === "wiki" && segments[1] === "spaces" && segments[2]) {
    const spaceKey = segments[2];
    const title = segments[5]
      ? decodeURIComponent(segments[5].replace(/\+/g, " ")).trim()
      : "";
    return {
      host: formatWorkspaceInfoHostLabel(value),
      spaceKey,
      title,
    };
  }

  // Pattern: /wiki/x/... (tiny URL) — no space info available
  if (segments[0] === "wiki") {
    return {
      host: formatWorkspaceInfoHostLabel(value),
      spaceKey: "",
      title: "",
    };
  }

  return null;
}

export function isConfluencePageUrl(value: string) {
  return extractConfluencePageReference(value) !== null;
}

export const WORKSPACE_INFO_FIELD_TYPE_LABELS: Record<
  WorkspaceInfoFieldType,
  string
> = {
  text: "Text",
  textarea: "Textarea",
  number: "Number",
  boolean: "Boolean",
  date: "Date",
  url: "URL",
  single_select: "Single select",
};

export function createEmptyWorkspaceInformation(): WorkspaceInformationState {
  return {
    jiraIssues: [],
    confluencePages: [],
    figmaResources: [],
    storybookResources: [],
    linkedPullRequests: [],
    slackThreads: [],
    notes: "",
    todos: [],
    customFields: [],
  };
}
