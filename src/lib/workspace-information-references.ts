import { i18n } from "@/i18n/runtime";
import {
  WORKSPACE_INFO_FIELD_TYPE_LABELS,
  formatStorybookAccessContext,
  resolveWorkspaceTodoStatus,
  type WorkspaceInformationState,
} from "@/lib/workspace-information";

export const WORKSPACE_INFORMATION_REFERENCE_SECTIONS = [
  "turn-summary",
  "lens",
  "web",
  "notes",
  "todo",
  "pr",
  "jira",
  "crane",
  "confluence",
  "storybook",
  "amplify",
  "slack",
  "figma",
  "custom",
] as const;

export type WorkspaceInformationReferenceSection =
  (typeof WORKSPACE_INFORMATION_REFERENCE_SECTIONS)[number];

export interface WorkspaceInformationReference {
  section: WorkspaceInformationReferenceSection;
  scope: "section" | "item";
  itemId?: string;
  label: string;
  token: string;
}

/** Live Lens browser state injected when a prompt references `@lens`. */
export interface LensReferenceState {
  url: string;
  title: string;
  isLoading?: boolean;
}

export interface WorkspaceInformationReferenceOption {
  reference: WorkspaceInformationReference;
  title: string;
  description: string;
  group: string;
  kind: "section" | "item";
  searchText: string;
}

const SECTION_LABEL_KEYS = {
  "turn-summary": "workspace:workspaceInformationReferences.latestTurnSummary",
  "lens": "workspace:workspaceInformationReferences.lensBrowser",
  "web": "workspace:workspaceInformationReferences.webBrowser",
  "notes": "workspace:workspaceInformationReferences.notes",
  "todo": "workspace:workspaceInformationReferences.todos",
  "pr": "workspace:workspaceInformationReferences.linkedPullRequests",
  "jira": "workspace:workspaceInformationReferences.jiraIssues",
  "crane": "workspace:workspaceInformationReferences.craneIssues",
  "confluence": "workspace:workspaceInformationReferences.confluencePages",
  "storybook": "workspace:workspaceInformationReferences.storybookResources",
  "amplify": "workspace:workspaceInformationReferences.amplifyLinks",
  "slack": "workspace:workspaceInformationReferences.slackThreads",
  "figma": "workspace:workspaceInformationReferences.figmaResources",
  "custom": "workspace:workspaceInformationReferences.customFields",
} as const;
function sectionLabel(section: WorkspaceInformationReferenceSection, sourceLocale = false) {
  return i18n.t(SECTION_LABEL_KEYS[section], { lng: sourceLocale ? "en" : undefined });
}

const SECTION_ALIASES: Record<string, WorkspaceInformationReferenceSection> = {
  "turn-summary": "turn-summary",
  turnsummary: "turn-summary",
  summary: "turn-summary",
  lens: "lens",
  browser: "lens",
  web: "web",
  externalbrowser: "web",
  systembrowser: "web",
  notes: "notes",
  note: "notes",
  todo: "todo",
  todos: "todo",
  pr: "pr",
  prs: "pr",
  pullrequest: "pr",
  pullrequests: "pr",
  jira: "jira",
  issue: "jira",
  issues: "jira",
  crane: "crane",
  craneissue: "crane",
  craneissues: "crane",
  confluence: "confluence",
  page: "confluence",
  pages: "confluence",
  storybook: "storybook",
  amplify: "amplify",
  slack: "slack",
  figma: "figma",
  custom: "custom",
  field: "custom",
  fields: "custom",
};

const MAX_SECTION_ITEMS = 12;

function normalizeTokenValue(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function truncate(value: string, maxLength = 240) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function createSectionReference(
  section: WorkspaceInformationReferenceSection,
): WorkspaceInformationReference {
  return {
    section,
    scope: "section",
    label: sectionLabel(section),
    // Browser surfaces are first-class mentions rather than generic entries.
    token:
      section === "lens"
        ? "@lens"
        : section === "web"
          ? "@web"
          : `@info:${section}`,
  };
}

function createItemReference(args: {
  section: WorkspaceInformationReferenceSection;
  itemId: string;
  label: string;
}): WorkspaceInformationReference {
  return {
    section: args.section,
    scope: "item",
    itemId: args.itemId,
    label: args.label,
    token: `@info:${args.section}/${encodeURIComponent(args.itemId)}`,
  };
}

function sectionDescription(section: WorkspaceInformationReferenceSection, count: number, sourceLocale = false) {
  const t = i18n.getFixedT(sourceLocale ? "en" : null, ["workspace"]);
  if (section === "lens") {
    return t("workspace:workspaceInformationReferences.referenceTheCurrentLensBrowserPage");
  }
  if (section === "web") {
    return t("workspace:workspaceInformationReferences.useTheProviderSNativeBrowserExtension");
  }
  if (section === "notes") {
    return t("workspace:workspaceInformationReferences.referenceTheFullWorkspaceNotesField");
  }
  if (section === "turn-summary") {
    return t("workspace:workspaceInformationReferences.referenceTheLatestCompletedTurnSummary");
  }
  return t("workspace:workspaceInformationReferences.referenceAllValueValueInThisInformation", { count });
}

function optionFromReference(args: {
  reference: WorkspaceInformationReference;
  title: string;
  description: string;
  group: string;
  kind: "section" | "item";
}): WorkspaceInformationReferenceOption {
  return {
    ...args,
    searchText: [
      args.reference.token,
      args.reference.label,
      args.title,
      args.description,
      args.group,
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function getCustomFieldValue(
  field: WorkspaceInformationState["customFields"][number],
  sourceLocale = false,
) {
  if (field.type === "boolean") {
    return String(field.value);
  }
  if (field.type === "number") {
    return field.value == null ? i18n.t("workspace:workspaceInformationReferences.empty", { lng: sourceLocale ? "en" : undefined }) : String(field.value);
  }
  return field.value.trim() || i18n.t("workspace:workspaceInformationReferences.empty", { lng: sourceLocale ? "en" : undefined });
}

export function buildWorkspaceInformationReferenceOptions(
  info: WorkspaceInformationState,
  sourceLocale = false,
): WorkspaceInformationReferenceOption[] {
  const t = i18n.getFixedT(sourceLocale ? "en" : null, ["workspace"]);
  const sectionCounts: Record<WorkspaceInformationReferenceSection, number> = {
    "turn-summary": info.turnSummary ? 1 : 0,
    lens: 1,
    web: 1,
    notes: info.notes.trim() ? 1 : 0,
    todo: info.todos.length,
    pr: info.linkedPullRequests.length,
    jira: info.jiraIssues.length,
    crane: (info.craneIssues ?? []).length,
    confluence: (info.confluencePages ?? []).length,
    storybook: (info.storybookResources ?? []).length,
    amplify: (info.amplifyLinks ?? []).length,
    slack: (info.slackThreads ?? []).length,
    figma: info.figmaResources.length,
    custom: info.customFields.length,
  };

  const options: WorkspaceInformationReferenceOption[] =
    WORKSPACE_INFORMATION_REFERENCE_SECTIONS.map((section) =>
      optionFromReference({
        reference: { ...createSectionReference(section), label: sectionLabel(section, sourceLocale) },
        title: sectionLabel(section, sourceLocale),
        description: sectionDescription(section, sectionCounts[section], sourceLocale),
        group: t("workspace:workspaceInformationReferences.sections"),
        kind: "section",
      }),
    );

  if (info.turnSummary) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "turn-summary",
          itemId: info.turnSummary.turnId,
          label: info.turnSummary.taskTitle || t("workspace:workspaceInformationReferences.latestTurn"),
        }),
        title: info.turnSummary.taskTitle || t("workspace:workspaceInformationReferences.latestTurn"),
        description: truncate(
          [info.turnSummary.requestSummary, info.turnSummary.workSummary]
            .filter(Boolean)
            .join(" | "),
        ),
        group: sectionLabel("turn-summary", sourceLocale),
        kind: "item",
      }),
    );
  }

  for (const todo of info.todos) {
    const status = resolveWorkspaceTodoStatus(todo);
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "todo",
          itemId: todo.id,
          label: todo.text || t("workspace:workspaceInformationReferences.todo"),
        }),
        title: todo.text || t("workspace:workspaceInformationReferences.todo"),
        description: sourceLocale ? status : t(`workspace:workspaceInformationReferences.todoStatus.${status === "in_progress" ? "inProgress" : status}`),
        group: sectionLabel("todo", sourceLocale),
        kind: "item",
      }),
    );
  }

  for (const item of info.linkedPullRequests) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "pr",
          itemId: item.id,
          label: item.title || item.url || t("workspace:workspaceInformationReferences.pullRequest"),
        }),
        title: item.title || item.url || t("workspace:workspaceInformationReferences.pullRequest"),
        description: truncate([item.status, item.url, item.note].filter(Boolean).join(" | ")),
        group: sectionLabel("pr", sourceLocale),
        kind: "item",
      }),
    );
  }

  for (const item of info.jiraIssues) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "jira",
          itemId: item.id,
          label: item.issueKey || item.title || t("workspace:workspaceInformationReferences.jiraIssue"),
        }),
        title: [item.issueKey, item.title].filter(Boolean).join(" · ") || t("workspace:workspaceInformationReferences.jiraIssue"),
        description: truncate([item.status, item.url, item.note].filter(Boolean).join(" | ")),
        group: sectionLabel("jira", sourceLocale),
        kind: "item",
      }),
    );
  }

  for (const item of info.craneIssues ?? []) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "crane",
          itemId: item.id,
          label: item.issueKey || item.title || t("workspace:workspaceInformationReferences.craneIssue"),
        }),
        title: [item.issueKey, item.title].filter(Boolean).join(" · ") || t("workspace:workspaceInformationReferences.craneIssue"),
        description: truncate([item.status, item.url, item.note].filter(Boolean).join(" | ")),
        group: sectionLabel("crane", sourceLocale),
        kind: "item",
      }),
    );
  }

  for (const item of info.confluencePages ?? []) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "confluence",
          itemId: item.id,
          label: item.title || item.url || t("workspace:workspaceInformationReferences.confluencePage"),
        }),
        title: item.title || item.url || t("workspace:workspaceInformationReferences.confluencePage"),
        description: truncate([item.spaceKey, item.url, item.note].filter(Boolean).join(" | ")),
        group: sectionLabel("confluence", sourceLocale),
        kind: "item",
      }),
    );
  }

  for (const item of info.storybookResources ?? []) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "storybook",
          itemId: item.id,
          label: item.title || item.url || t("workspace:workspaceInformationReferences.storybookResource"),
        }),
        title: item.title || item.url || t("workspace:workspaceInformationReferences.storybookResource"),
        description: truncate(
          [item.url, formatStorybookAccessContext(item), item.note]
            .filter(Boolean)
            .join(" | "),
        ),
        group: sectionLabel("storybook", sourceLocale),
        kind: "item",
      }),
    );
  }

  for (const item of info.amplifyLinks ?? []) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "amplify",
          itemId: item.id,
          label: item.label || item.url || t("workspace:workspaceInformationReferences.amplifyLink"),
        }),
        title: item.label || item.url || t("workspace:workspaceInformationReferences.amplifyLink"),
        description: truncate([item.url, item.note].filter(Boolean).join(" | ")),
        group: sectionLabel("amplify", sourceLocale),
        kind: "item",
      }),
    );
  }

  for (const item of info.slackThreads ?? []) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "slack",
          itemId: item.id,
          label: item.channelName || item.url || t("workspace:workspaceInformationReferences.slackThread"),
        }),
        title: item.channelName || item.url || t("workspace:workspaceInformationReferences.slackThread"),
        description: truncate([item.url, item.note].filter(Boolean).join(" | ")),
        group: sectionLabel("slack", sourceLocale),
        kind: "item",
      }),
    );
  }

  for (const item of info.figmaResources) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "figma",
          itemId: item.id,
          label: item.title || item.url || t("workspace:workspaceInformationReferences.figmaResource"),
        }),
        title: item.title || item.url || t("workspace:workspaceInformationReferences.figmaResource"),
        description: truncate(
          [item.nodeId ? `node ${item.nodeId}` : "", item.url, item.note]
            .filter(Boolean)
            .join(" | "),
        ),
        group: sectionLabel("figma", sourceLocale),
        kind: "item",
      }),
    );
  }

  for (const field of info.customFields) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "custom",
          itemId: field.id,
          label: field.label || t("workspace:workspaceInformationReferences.customField"),
        }),
        title: field.label || t("workspace:workspaceInformationReferences.customField"),
        description: truncate(`${sourceLocale ? field.type : WORKSPACE_INFO_FIELD_TYPE_LABELS[field.type]}: ${getCustomFieldValue(field, sourceLocale)}`),
        group: sectionLabel("custom", sourceLocale),
        kind: "item",
      }),
    );
  }

  return options;
}

export function getActiveWorkspaceInformationTokenMatch(args: {
  text: string;
  caretIndex: number;
}): { token: string; query: string; start: number; end: number } | null {
  const left = args.text.slice(0, args.caretIndex);
  const match = left.match(/(?:^|\s)(@(?:info(?::[^\s]*)?|[^\s]*)?)$/i);
  if (!match || match.index == null) {
    return null;
  }
  const token = match[1] ?? "";
  if (!token) {
    return null;
  }
  const start = match.index + match[0].length - token.length;
  return {
    token,
    query: token
      .replace(/^@info:?/i, "")
      .replace(/^@/, ""),
    start,
    end: args.caretIndex,
  };
}

export function replaceWorkspaceInformationToken(args: {
  text: string;
  match: { start: number; end: number };
  reference: WorkspaceInformationReference;
}) {
  const nextToken = `${args.reference.token} `;
  return `${args.text.slice(0, args.match.start)}${nextToken}${args.text.slice(args.match.end)}`;
}

export function resolveWorkspaceInformationReferenceFromToken(
  token: string,
): WorkspaceInformationReference | null {
  const normalized = token.trim();
  if (/^@lens$/i.test(normalized)) {
    return createSectionReference("lens");
  }
  if (/^@web$/i.test(normalized)) {
    return createSectionReference("web");
  }
  const match = normalized.match(/^@info(?::([^/\s]+)(?:\/([^\s]+))?)?$/i);
  if (!match) {
    return null;
  }
  const sectionAlias = normalizeTokenValue(match[1] ?? "");
  const section = sectionAlias ? SECTION_ALIASES[sectionAlias] : null;
  if (!section) {
    return null;
  }
  const itemId = match[2] ? decodeURIComponent(match[2]) : "";
  if (itemId) {
    return createItemReference({
      section,
      itemId,
      label: i18n.t("workspace:workspaceInformationReferences.sectionItem", { section: sectionLabel(section) }),
    });
  }
  return createSectionReference(section);
}

export function extractWorkspaceInformationReferencesFromText(text: string) {
  const references: WorkspaceInformationReference[] = [];
  for (const match of text.matchAll(
    /@(?:info(?::[^\s.,;!?)]*)?|(?:lens|web)(?![A-Za-z0-9_-]))/gi,
  )) {
    const reference = resolveWorkspaceInformationReferenceFromToken(match[0]);
    if (reference) {
      references.push(reference);
    }
  }
  return references;
}

function findReferenceOption(args: {
  info: WorkspaceInformationState;
  reference: WorkspaceInformationReference;
}) {
  const targetItemId = normalizeTokenValue(args.reference.itemId ?? "");
  return buildWorkspaceInformationReferenceOptions(args.info, true).find((option) => {
    const ref = option.reference;
    const optionTokens = [
      ref.itemId,
      ref.label,
      option.title,
      option.description.split("|")[0],
    ]
      .filter(Boolean)
      .map((value) => normalizeTokenValue(value ?? ""));
    return (
      ref.section === args.reference.section &&
      ref.scope === args.reference.scope &&
      (ref.scope === "section" || optionTokens.includes(targetItemId))
    );
  });
}

function formatLensReferenceLines(lens: LensReferenceState | null | undefined) {
  if (!lens || !lens.url.trim()) {
    return [
      "(Lens browser state unavailable — the Lens panel may be closed or blank.)",
      "Use the Stave Lens tools to open or inspect the built-in browser.",
    ];
  }
  return [
    `Current URL: ${lens.url}`,
    `Page title: ${lens.title.trim() || "(untitled)"}`,
    ...(lens.isLoading ? ["(page is still loading)"] : []),
    "Use the Stave Lens tools (snapshot, get text, screenshot) to inspect or drive this page.",
  ];
}

function formatWebReferenceLines() {
  return [
    "`@web` requests the active provider's native external-browser integration for this interactive turn.",
    "Use the provider's browser extension tools to reference existing tabs and signed-in page state. Do not substitute Lens, web search, or a one-way URL launcher for browser interaction.",
    "Follow the native provider's site-access and sensitive-action confirmation flow. Never inspect or expose raw cookies, passwords, or session tokens.",
    "Chrome access is attempted for the current turn. If it fails, report that failure in the conversation.",
  ];
}

function formatSectionItemLines(args: {
  info: WorkspaceInformationState;
  section: WorkspaceInformationReferenceSection;
  lens?: LensReferenceState | null;
}) {
  if (args.section === "lens") {
    return formatLensReferenceLines(args.lens);
  }
  if (args.section === "web") {
    return formatWebReferenceLines();
  }
  const optionItems = buildWorkspaceInformationReferenceOptions(args.info, true)
    .filter(
      (option) =>
        option.kind === "item" && option.reference.section === args.section,
    )
    .slice(0, MAX_SECTION_ITEMS);

  if (args.section === "notes") {
    return [args.info.notes.trim() || "(empty)"];
  }
  if (args.section === "turn-summary") {
    if (!args.info.turnSummary) {
      return ["(empty)"];
    }
    return [
      [
        args.info.turnSummary.taskTitle,
        args.info.turnSummary.requestSummary,
        args.info.turnSummary.workSummary,
      ]
        .filter(Boolean)
        .join(" | "),
    ];
  }
  if (optionItems.length === 0) {
    return ["(none)"];
  }
  const omitted = buildWorkspaceInformationReferenceOptions(args.info, true).filter(
    (option) =>
      option.kind === "item" && option.reference.section === args.section,
  ).length - optionItems.length;
  return [
    ...optionItems.map(
      (option) =>
        `- ${option.title}${option.description ? ` | ${option.description}` : ""}`,
    ),
    ...(omitted > 0 ? [`- ${omitted} more omitted`] : []),
  ];
}

export function formatWorkspaceInformationReferencesContext(args: {
  info: WorkspaceInformationState;
  references: readonly WorkspaceInformationReference[];
  lens?: LensReferenceState | null;
}) {
  const sections: string[] = [];

  for (const reference of args.references) {
    if (reference.scope === "section") {
      sections.push(
        `Section: ${sectionLabel(reference.section, true)} (${reference.token})`,
        ...formatSectionItemLines({
          info: args.info,
          section: reference.section,
          lens: args.lens,
        }),
        "",
      );
      continue;
    }

    const option = findReferenceOption({ info: args.info, reference });
    sections.push(
      `Item: ${option?.title ?? reference.label} (${reference.token})`,
      option?.description ? option.description : "(item unavailable)",
      "",
    );
  }

  return sections.join("\n").trim();
}

export function getWorkspaceInformationReferenceLabel(
  reference: WorkspaceInformationReference,
) {
  return reference.scope === "section"
    ? sectionLabel(reference.section)
    : reference.label;
}
