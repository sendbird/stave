import type { IntentGuardContextInput } from "./source-control-review";

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

export interface WorkspaceAmplifyLink {
  id: string;
  url: string;
  label: string;
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
  amplifyLinks: WorkspaceAmplifyLink[];
  slackThreads: WorkspaceSlackThread[];
  turnSummary?: WorkspaceTurnSummary | null;
  notes: string;
  todos: WorkspaceTodoItem[];
  customFields: WorkspaceInfoCustomField[];
  /**
   * Ids of the resources (Jira/Confluence/Figma) pinned as first-class intent
   * anchors. The C2 intent guard checks changes only against these pinned
   * anchors (plus freeform notes); an empty/absent list disarms the guard.
   */
  intentAnchorIds?: string[];
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

export function createWorkspaceAmplifyLink(): WorkspaceAmplifyLink {
  return {
    id: buildWorkspaceInformationId("amplify"),
    url: "",
    label: "",
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

/**
 * Collapse linked PR URL variants for display and omit the current branch PR,
 * which the Information panel renders as its own first-class row.
 */
export function resolveVisibleWorkspaceLinkedPullRequests(args: {
  items: WorkspaceLinkedPullRequest[];
  currentBranchUrl?: string | null;
}): WorkspaceLinkedPullRequest[] {
  const seen = new Set<string>();
  if (args.currentBranchUrl) {
    const reference = extractGitHubPullRequestReference(args.currentBranchUrl);
    if (reference) {
      seen.add(
        `${reference.owner.toLowerCase()}/${reference.repo.toLowerCase()}#${reference.number}`,
      );
    }
  }

  return args.items.filter((item) => {
    const reference = extractGitHubPullRequestReference(item.url);
    if (!reference) {
      return true;
    }
    const key = `${reference.owner.toLowerCase()}/${reference.repo.toLowerCase()}#${reference.number}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

export interface AmplifyLinkReference {
  host: string;
  branch: string;
  appId: string;
}

/**
 * Matches AWS Amplify hosting deploy URLs, e.g.
 * `https://main.d123abc456.amplifyapp.com`.
 */
export function extractAmplifyLinkReference(
  value: string,
): AmplifyLinkReference | null {
  const url = parseWorkspaceInfoUrl(value);
  if (!url || !url.hostname.endsWith(".amplifyapp.com")) {
    return null;
  }

  const match = /^([^.]+)\.([^.]+)\.amplifyapp\.com$/.exec(url.hostname);
  if (!match) {
    return null;
  }

  return {
    host: formatWorkspaceInfoHostLabel(value),
    branch: match[1] ?? "",
    appId: match[2] ?? "",
  };
}

export function isAmplifyLinkUrl(value: string) {
  return extractAmplifyLinkReference(value) !== null;
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

// ---------------------------------------------------------------------------
// Workspace resource upsert + dedup + prompt auto-detection
// ---------------------------------------------------------------------------

export const WORKSPACE_RESOURCE_KINDS = [
  "jira",
  "pull_request",
  "confluence",
  "figma",
  "storybook",
  "slack",
  "amplify",
] as const;

export type WorkspaceResourceKind = (typeof WORKSPACE_RESOURCE_KINDS)[number];

export type WorkspaceResourceItem =
  | WorkspaceJiraIssue
  | WorkspaceLinkedPullRequest
  | WorkspaceConfluencePage
  | WorkspaceFigmaResource
  | WorkspaceStorybookResource
  | WorkspaceSlackThread
  | WorkspaceAmplifyLink;

export interface WorkspaceResourceInput {
  kind: WorkspaceResourceKind;
  url: string;
  title?: string;
  issueKey?: string;
  status?: string;
  note?: string;
  nodeId?: string;
  channelName?: string;
  spaceKey?: string;
  storybookAccessKind?: string;
  storybookExternalRepo?: string;
  storybookReadableVia?: string;
  storybookSourceHint?: string;
}

function normalizeWorkspaceResourceUrlKey(value: string) {
  const url = parseWorkspaceInfoUrl(value);
  if (!url) {
    return value.trim().toLowerCase().replace(/\/+$/, "");
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  return `${host}${url.pathname.replace(/\/+$/, "")}${url.search}`;
}

/**
 * Canonical identity for a workspace resource, used to collapse duplicate
 * registrations of the same underlying entity across URL variants (query
 * params, trailing slashes, `www.` prefixes, comment anchors, …).
 */
export function buildWorkspaceResourceDedupeKey(args: {
  kind: WorkspaceResourceKind;
  url: string;
  issueKey?: string;
  nodeId?: string;
}): string {
  const url = args.url.trim();
  switch (args.kind) {
    case "jira": {
      const issueKey =
        args.issueKey?.trim() || extractJiraIssueReference(url)?.issueKey || "";
      return issueKey
        ? `jira:key:${issueKey.toUpperCase()}`
        : `jira:url:${normalizeWorkspaceResourceUrlKey(url)}`;
    }
    case "pull_request": {
      const reference = extractGitHubPullRequestReference(url);
      return reference
        ? `pr:${reference.owner.toLowerCase()}/${reference.repo.toLowerCase()}#${reference.number}`
        : `pr:url:${normalizeWorkspaceResourceUrlKey(url)}`;
    }
    case "confluence": {
      const parsed = parseWorkspaceInfoUrl(url);
      if (parsed) {
        const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
        // /wiki/spaces/SPACE/pages/<pageId>/<title> — the page id is the
        // identity; the title suffix and query params vary between copies.
        const segments = parsed.pathname.split("/").filter(Boolean);
        const pageId = segments[segments.indexOf("pages") + 1] ?? "";
        if (segments.includes("pages") && /^\d+$/.test(pageId)) {
          return `confluence:page:${host}:${pageId}`;
        }
        return `confluence:url:${host}${parsed.pathname.replace(/\/+$/, "")}`;
      }
      return `confluence:url:${normalizeWorkspaceResourceUrlKey(url)}`;
    }
    case "figma": {
      const reference = extractFigmaResourceReference(url);
      const nodeId = args.nodeId?.trim() || reference?.nodeId || "";
      return reference
        ? `figma:${reference.fileKey}:${nodeId}`
        : `figma:url:${normalizeWorkspaceResourceUrlKey(url)}`;
    }
    case "storybook": {
      const reference = extractStorybookResourceReference(url);
      return reference?.storyPath
        ? `storybook:${reference.host.toLowerCase()}:${reference.storyPath}`
        : `storybook:url:${normalizeWorkspaceResourceUrlKey(url)}`;
    }
    case "slack": {
      const parsed = parseWorkspaceInfoUrl(url);
      // The /archives/<channel>/<message> path identifies the thread; query
      // params (thread_ts, cid) vary between copies of the same permalink.
      return parsed
        ? `slack:${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`
        : `slack:url:${normalizeWorkspaceResourceUrlKey(url)}`;
    }
    case "amplify": {
      const parsed = parseWorkspaceInfoUrl(url);
      // One deploy per `<branch>.<appId>.amplifyapp.com` host.
      return parsed
        ? `amplify:${parsed.hostname.toLowerCase()}`
        : `amplify:url:${normalizeWorkspaceResourceUrlKey(url)}`;
    }
  }
}

export type WorkspaceLinkedPullRequestDuplicate =
  | "current_branch"
  | "linked";

/**
 * Update a manually linked PR URL without allowing a second entry for the same
 * GitHub PR. Empty draft rows are discarded when a pasted URL is a duplicate;
 * edits to an existing row are left unchanged.
 */
export function updateWorkspaceLinkedPullRequestUrl(args: {
  items: WorkspaceLinkedPullRequest[];
  itemId: string;
  url: string;
  currentBranchUrl?: string | null;
}): {
  items: WorkspaceLinkedPullRequest[];
  duplicate: WorkspaceLinkedPullRequestDuplicate | null;
} {
  const target = args.items.find((item) => item.id === args.itemId);
  if (!target) {
    return { items: args.items, duplicate: null };
  }

  const nextReference = extractGitHubPullRequestReference(args.url);
  if (nextReference) {
    const nextKey = buildWorkspaceResourceDedupeKey({
      kind: "pull_request",
      url: args.url,
    });
    const currentBranchKey = args.currentBranchUrl
      ? buildWorkspaceResourceDedupeKey({
          kind: "pull_request",
          url: args.currentBranchUrl,
        })
      : null;
    const duplicate: WorkspaceLinkedPullRequestDuplicate | null =
      currentBranchKey === nextKey
        ? "current_branch"
        : args.items.some(
              (item) =>
                item.id !== args.itemId &&
                extractGitHubPullRequestReference(item.url) !== null &&
                buildWorkspaceResourceDedupeKey({
                  kind: "pull_request",
                  url: item.url,
                }) === nextKey,
            )
          ? "linked"
          : null;

    if (duplicate) {
      return {
        items: target.url.trim()
          ? args.items
          : args.items.filter((item) => item.id !== args.itemId),
        duplicate,
      };
    }
  }

  if (target.url === args.url) {
    return { items: args.items, duplicate: null };
  }
  return {
    items: args.items.map((item) =>
      item.id === args.itemId ? { ...item, url: args.url } : item,
    ),
    duplicate: null,
  };
}

export interface WorkspaceResourceUpsertResult {
  state: WorkspaceInformationState;
  resource: WorkspaceResourceItem;
  deduplicated: boolean;
}

function normalizeWorkspaceLinkedPrStatusValue(
  value?: string,
): WorkspaceLinkedPrStatus {
  const normalized = value?.trim();
  return WORKSPACE_LINKED_PR_STATUSES.includes(
    normalized as WorkspaceLinkedPrStatus,
  )
    ? (normalized as WorkspaceLinkedPrStatus)
    : "planned";
}

function fillIfEmpty(currentValue: string, nextValue: string) {
  return currentValue.trim() ? currentValue : nextValue;
}

function isUnchangedShallow<T extends object>(current: T, next: T) {
  return Object.keys(next).every(
    (key) => current[key as keyof T] === next[key as keyof T],
  );
}

function upsertWorkspaceResourceList<T extends { id: string; url: string }>(args: {
  items: T[];
  dedupeKeyOf: (item: T) => string;
  dedupeKey: string;
  merge: (existing: T) => T;
  create: () => T;
}): { items: T[]; resource: T; deduplicated: boolean; changed: boolean } {
  const existingIndex = args.items.findIndex(
    (item) => args.dedupeKeyOf(item) === args.dedupeKey,
  );
  if (existingIndex >= 0) {
    const existing = args.items[existingIndex] as T;
    const merged = args.merge(existing);
    if (isUnchangedShallow(existing, merged)) {
      return {
        items: args.items,
        resource: existing,
        deduplicated: true,
        changed: false,
      };
    }
    return {
      items: args.items.map((item, index) =>
        index === existingIndex ? merged : item,
      ),
      resource: merged,
      deduplicated: true,
      changed: true,
    };
  }
  const created = args.create();
  return {
    items: [...args.items, created],
    resource: created,
    deduplicated: false,
    changed: true,
  };
}

/**
 * Append a resource to the Information panel state, or merge it into an
 * existing entry when the canonical identity already exists. Returns the
 * unchanged `current` reference when the upsert is a no-op.
 */
export function upsertWorkspaceResourceInState(args: {
  current: WorkspaceInformationState;
  input: WorkspaceResourceInput;
}): WorkspaceResourceUpsertResult {
  const { current, input } = args;
  const url = input.url.trim();
  const title = input.title?.trim() ?? "";
  const note = input.note?.trim() ?? "";
  const dedupeKey = buildWorkspaceResourceDedupeKey({
    kind: input.kind,
    url,
    issueKey: input.issueKey,
    nodeId: input.nodeId,
  });

  switch (input.kind) {
    case "jira": {
      const issueKey =
        input.issueKey?.trim() || extractJiraIssueReference(url)?.issueKey || "";
      const status = input.status?.trim() ?? "";
      const result = upsertWorkspaceResourceList({
        items: current.jiraIssues,
        dedupeKey,
        dedupeKeyOf: (item) =>
          buildWorkspaceResourceDedupeKey({
            kind: "jira",
            url: item.url,
            issueKey: item.issueKey,
          }),
        merge: (existing) => ({
          ...existing,
          issueKey: fillIfEmpty(existing.issueKey, issueKey),
          title: fillIfEmpty(existing.title, title),
          status: status || existing.status,
          note: fillIfEmpty(existing.note, note),
        }),
        create: () => {
          const nextLink = createWorkspaceJiraIssue();
          nextLink.issueKey = issueKey;
          nextLink.title = title || issueKey || url;
          nextLink.url = url;
          nextLink.status = status;
          nextLink.note = note;
          return nextLink;
        },
      });
      return {
        state: result.changed
          ? { ...current, jiraIssues: result.items }
          : current,
        resource: result.resource,
        deduplicated: result.deduplicated,
      };
    }
    case "pull_request": {
      const result = upsertWorkspaceResourceList({
        items: current.linkedPullRequests,
        dedupeKey,
        dedupeKeyOf: (item) =>
          buildWorkspaceResourceDedupeKey({
            kind: "pull_request",
            url: item.url,
          }),
        merge: (existing) => ({
          ...existing,
          title: fillIfEmpty(existing.title, title),
          status: input.status?.trim()
            ? normalizeWorkspaceLinkedPrStatusValue(input.status)
            : existing.status,
          note: fillIfEmpty(existing.note, note),
        }),
        create: () => {
          const nextLink = createWorkspaceLinkedPullRequest();
          nextLink.title = title || url;
          nextLink.url = url;
          nextLink.status = normalizeWorkspaceLinkedPrStatusValue(input.status);
          nextLink.note = note;
          return nextLink;
        },
      });
      return {
        state: result.changed
          ? { ...current, linkedPullRequests: result.items }
          : current,
        resource: result.resource,
        deduplicated: result.deduplicated,
      };
    }
    case "confluence": {
      const spaceKey = input.spaceKey?.trim() ?? "";
      const result = upsertWorkspaceResourceList({
        items: current.confluencePages,
        dedupeKey,
        dedupeKeyOf: (item) =>
          buildWorkspaceResourceDedupeKey({
            kind: "confluence",
            url: item.url,
          }),
        merge: (existing) => ({
          ...existing,
          title: fillIfEmpty(existing.title, title),
          spaceKey: fillIfEmpty(existing.spaceKey, spaceKey),
          note: fillIfEmpty(existing.note, note),
        }),
        create: () => {
          const nextLink = createWorkspaceConfluencePage();
          nextLink.title = title || url;
          nextLink.url = url;
          nextLink.spaceKey = spaceKey;
          nextLink.note = note;
          return nextLink;
        },
      });
      return {
        state: result.changed
          ? { ...current, confluencePages: result.items }
          : current,
        resource: result.resource,
        deduplicated: result.deduplicated,
      };
    }
    case "figma": {
      const nodeId = input.nodeId?.trim() ?? "";
      const result = upsertWorkspaceResourceList({
        items: current.figmaResources,
        dedupeKey,
        dedupeKeyOf: (item) =>
          buildWorkspaceResourceDedupeKey({
            kind: "figma",
            url: item.url,
            nodeId: item.nodeId,
          }),
        merge: (existing) => ({
          ...existing,
          title: fillIfEmpty(existing.title, title),
          nodeId: fillIfEmpty(existing.nodeId, nodeId),
          note: fillIfEmpty(existing.note, note),
        }),
        create: () => {
          const nextLink = createWorkspaceFigmaResource();
          nextLink.title = title || url;
          nextLink.url = url;
          nextLink.nodeId = nodeId;
          nextLink.note = note;
          return nextLink;
        },
      });
      return {
        state: result.changed
          ? { ...current, figmaResources: result.items }
          : current,
        resource: result.resource,
        deduplicated: result.deduplicated,
      };
    }
    case "storybook": {
      const access = resolveStorybookResourceAccess({
        url,
        accessKind: input.storybookAccessKind,
        externalRepo: input.storybookExternalRepo,
        readableVia: input.storybookReadableVia,
        sourceHint: input.storybookSourceHint,
      });
      const result = upsertWorkspaceResourceList({
        items: current.storybookResources ?? [],
        dedupeKey,
        dedupeKeyOf: (item) =>
          buildWorkspaceResourceDedupeKey({
            kind: "storybook",
            url: item.url,
          }),
        merge: (existing) => ({
          ...existing,
          title: fillIfEmpty(existing.title, title),
          note: fillIfEmpty(existing.note, note),
          access: existing.access ?? access,
        }),
        create: () => {
          const nextLink = createWorkspaceStorybookResource();
          nextLink.title = title || url;
          nextLink.url = url;
          nextLink.note = note;
          nextLink.access = access;
          return nextLink;
        },
      });
      return {
        state: result.changed
          ? { ...current, storybookResources: result.items }
          : current,
        resource: result.resource,
        deduplicated: result.deduplicated,
      };
    }
    case "slack": {
      const channelName = input.channelName?.trim() ?? "";
      const result = upsertWorkspaceResourceList({
        items: current.slackThreads,
        dedupeKey,
        dedupeKeyOf: (item) =>
          buildWorkspaceResourceDedupeKey({
            kind: "slack",
            url: item.url,
          }),
        merge: (existing) => ({
          ...existing,
          channelName: fillIfEmpty(existing.channelName, channelName),
          note: fillIfEmpty(existing.note, note),
        }),
        create: () => {
          const nextLink = createWorkspaceSlackThread();
          nextLink.url = url;
          nextLink.channelName = channelName;
          nextLink.note = note;
          return nextLink;
        },
      });
      return {
        state: result.changed
          ? { ...current, slackThreads: result.items }
          : current,
        resource: result.resource,
        deduplicated: result.deduplicated,
      };
    }
    case "amplify": {
      const label = title || extractAmplifyLinkReference(url)?.branch || "";
      const result = upsertWorkspaceResourceList({
        items: current.amplifyLinks ?? [],
        dedupeKey,
        dedupeKeyOf: (item) =>
          buildWorkspaceResourceDedupeKey({
            kind: "amplify",
            url: item.url,
          }),
        merge: (existing) => ({
          ...existing,
          label: fillIfEmpty(existing.label, label),
          note: fillIfEmpty(existing.note, note),
        }),
        create: () => {
          const nextLink = createWorkspaceAmplifyLink();
          nextLink.url = url;
          nextLink.label = label;
          nextLink.note = note;
          return nextLink;
        },
      });
      return {
        state: result.changed
          ? { ...current, amplifyLinks: result.items }
          : current,
        resource: result.resource,
        deduplicated: result.deduplicated,
      };
    }
  }
}

export interface DetectedWorkspaceResource {
  kind: WorkspaceResourceKind;
  url: string;
  title?: string;
  issueKey?: string;
  nodeId?: string;
  spaceKey?: string;
  channelName?: string;
}

const WORKSPACE_RESOURCE_URL_PATTERN = /https?:\/\/[^\s<>"'`\])}]+/g;

function classifyWorkspaceResourceUrl(
  url: string,
): DetectedWorkspaceResource | null {
  const parsed = parseWorkspaceInfoUrl(url);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  const prReference = extractGitHubPullRequestReference(url);
  if (prReference) {
    return {
      kind: "pull_request",
      url,
      title: `${prReference.owner}/${prReference.repo}#${prReference.number}`,
    };
  }
  const slackReference = extractSlackThreadReference(url);
  if (slackReference) {
    return { kind: "slack", url, channelName: slackReference.channelId };
  }
  const amplifyReference = extractAmplifyLinkReference(url);
  if (amplifyReference) {
    return { kind: "amplify", url, title: amplifyReference.branch };
  }
  const figmaReference = extractFigmaResourceReference(url);
  if (figmaReference) {
    return {
      kind: "figma",
      url,
      title: figmaReference.title || figmaReference.fileKey,
      nodeId: figmaReference.nodeId ?? "",
    };
  }
  const confluenceReference = extractConfluencePageReference(url);
  if (confluenceReference) {
    return {
      kind: "confluence",
      url,
      title: confluenceReference.title,
      spaceKey: confluenceReference.spaceKey,
    };
  }
  // Restrict Jira detection to Jira-looking hosts — the issue-key pattern
  // alone would false-positive on branch names in arbitrary URLs.
  if (host.endsWith("atlassian.net") || host.includes("jira")) {
    const jiraReference = extractJiraIssueReference(url);
    if (jiraReference) {
      return {
        kind: "jira",
        url,
        issueKey: jiraReference.issueKey,
        title: jiraReference.issueKey,
      };
    }
  }
  const storybookReference = extractStorybookResourceReference(url);
  if (
    storybookReference?.storyPath &&
    /^\/?(story|docs)\//.test(storybookReference.storyPath)
  ) {
    return { kind: "storybook", url, title: storybookReference.title };
  }
  return null;
}

/**
 * Scan free text (typically a user prompt) for URLs that can be registered in
 * the workspace Information panel. Results are deduplicated by canonical
 * identity within the scanned text.
 */
export function detectWorkspaceResourcesInText(
  text: string,
): DetectedWorkspaceResource[] {
  const results: DetectedWorkspaceResource[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(WORKSPACE_RESOURCE_URL_PATTERN)) {
    const url = match[0].replace(/[.,;:!?…]+$/, "");
    const detected = classifyWorkspaceResourceUrl(url);
    if (!detected) {
      continue;
    }
    const key = buildWorkspaceResourceDedupeKey({
      kind: detected.kind,
      url: detected.url,
      issueKey: detected.issueKey,
      nodeId: detected.nodeId,
    });
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(detected);
  }
  return results;
}

/**
 * Fold detected resources into the Information panel state. Returns the
 * unchanged `current` reference when every detection is already registered.
 */
export function applyDetectedWorkspaceResources(args: {
  current: WorkspaceInformationState;
  detected: DetectedWorkspaceResource[];
}): { state: WorkspaceInformationState; added: WorkspaceResourceItem[] } {
  let state = args.current;
  const added: WorkspaceResourceItem[] = [];
  for (const input of args.detected) {
    const result = upsertWorkspaceResourceInState({ current: state, input });
    if (!result.deduplicated) {
      added.push(result.resource);
    }
    state = result.state;
  }
  return { state, added };
}

export function shouldAutoFillWorkspaceInformation(args: {
  workspaceId: string;
  workspaceDefaultById: Record<string, boolean>;
}) {
  return !args.workspaceDefaultById[args.workspaceId];
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
    amplifyLinks: [],
    slackThreads: [],
    notes: "",
    todos: [],
    customFields: [],
    intentAnchorIds: [],
  };
}

// ---------------------------------------------------------------------------
// Intent anchors (C2 intent guard) — pin specific references as the
// authoritative product intent (PRD / spec / design) for a workspace.
// ---------------------------------------------------------------------------

/** Whether the resource id is currently pinned as an intent anchor. */
export function isWorkspaceIntentAnchor(
  info: Pick<WorkspaceInformationState, "intentAnchorIds">,
  id: string,
): boolean {
  return Boolean(info.intentAnchorIds?.includes(id));
}

/** Toggle a resource id in the intent-anchor set (immutably). */
export function toggleWorkspaceIntentAnchor(
  info: WorkspaceInformationState,
  id: string,
): WorkspaceInformationState {
  const current = info.intentAnchorIds ?? [];
  const next = current.includes(id)
    ? current.filter((anchorId) => anchorId !== id)
    : [...current, id];
  return { ...info, intentAnchorIds: next };
}

/**
 * Build the intent-guard context input from the pinned anchors only. Notes are
 * always included as freeform intent. Returns an empty input (which collects to
 * an empty string) when no resource anchors are pinned, so the guard stays
 * disarmed until the user explicitly pins intent.
 */
export function buildIntentGuardContextInput(
  info: WorkspaceInformationState,
): IntentGuardContextInput {
  const ids = info.intentAnchorIds ?? [];
  if (ids.length === 0) {
    return {};
  }
  const pinned = new Set(ids);
  return {
    notes: info.notes,
    jiraIssues: info.jiraIssues.filter((issue) => pinned.has(issue.id)),
    confluencePages: info.confluencePages.filter((page) =>
      pinned.has(page.id),
    ),
    figmaResources: info.figmaResources.filter((figma) =>
      pinned.has(figma.id),
    ),
  };
}
