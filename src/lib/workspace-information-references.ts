import {
  formatStorybookAccessContext,
  resolveWorkspaceTodoStatus,
  type WorkspaceInformationState,
} from "@/lib/workspace-information";

export const WORKSPACE_INFORMATION_REFERENCE_SECTIONS = [
  "turn-summary",
  "lens",
  "notes",
  "todo",
  "pr",
  "jira",
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

const SECTION_LABELS: Record<WorkspaceInformationReferenceSection, string> = {
  "turn-summary": "Latest turn summary",
  lens: "Lens browser",
  notes: "Notes",
  todo: "Todos",
  pr: "Linked pull requests",
  jira: "Jira issues",
  confluence: "Confluence pages",
  storybook: "Storybook resources",
  amplify: "Amplify links",
  slack: "Slack threads",
  figma: "Figma resources",
  custom: "Custom fields",
};

const SECTION_ALIASES: Record<string, WorkspaceInformationReferenceSection> = {
  "turn-summary": "turn-summary",
  turnsummary: "turn-summary",
  summary: "turn-summary",
  lens: "lens",
  browser: "lens",
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
    label: SECTION_LABELS[section],
    // Lens is a first-class mention rather than an Information panel entry.
    token: section === "lens" ? "@lens" : `@info:${section}`,
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

function sectionDescription(section: WorkspaceInformationReferenceSection, count: number) {
  if (section === "lens") {
    return "Reference the current Lens browser page.";
  }
  if (section === "notes") {
    return "Reference the full workspace notes field.";
  }
  if (section === "turn-summary") {
    return "Reference the latest completed turn summary.";
  }
  return `Reference all ${count} ${count === 1 ? "item" : "items"} in this Information section.`;
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
) {
  if (field.type === "boolean") {
    return String(field.value);
  }
  if (field.type === "number") {
    return field.value == null ? "(empty)" : String(field.value);
  }
  return field.value.trim() || "(empty)";
}

export function buildWorkspaceInformationReferenceOptions(
  info: WorkspaceInformationState,
): WorkspaceInformationReferenceOption[] {
  const sectionCounts: Record<WorkspaceInformationReferenceSection, number> = {
    "turn-summary": info.turnSummary ? 1 : 0,
    lens: 1,
    notes: info.notes.trim() ? 1 : 0,
    todo: info.todos.length,
    pr: info.linkedPullRequests.length,
    jira: info.jiraIssues.length,
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
        reference: createSectionReference(section),
        title: SECTION_LABELS[section],
        description: sectionDescription(section, sectionCounts[section]),
        group: "Sections",
        kind: "section",
      }),
    );

  if (info.turnSummary) {
    options.push(
      optionFromReference({
        reference: createItemReference({
          section: "turn-summary",
          itemId: info.turnSummary.turnId,
          label: info.turnSummary.taskTitle || "Latest turn",
        }),
        title: info.turnSummary.taskTitle || "Latest turn",
        description: truncate(
          [info.turnSummary.requestSummary, info.turnSummary.workSummary]
            .filter(Boolean)
            .join(" | "),
        ),
        group: SECTION_LABELS["turn-summary"],
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
          label: todo.text || "Todo",
        }),
        title: todo.text || "Todo",
        description: status,
        group: SECTION_LABELS.todo,
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
          label: item.title || item.url || "Pull request",
        }),
        title: item.title || item.url || "Pull request",
        description: truncate([item.status, item.url, item.note].filter(Boolean).join(" | ")),
        group: SECTION_LABELS.pr,
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
          label: item.issueKey || item.title || "Jira issue",
        }),
        title: [item.issueKey, item.title].filter(Boolean).join(" · ") || "Jira issue",
        description: truncate([item.status, item.url, item.note].filter(Boolean).join(" | ")),
        group: SECTION_LABELS.jira,
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
          label: item.title || item.url || "Confluence page",
        }),
        title: item.title || item.url || "Confluence page",
        description: truncate([item.spaceKey, item.url, item.note].filter(Boolean).join(" | ")),
        group: SECTION_LABELS.confluence,
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
          label: item.title || item.url || "Storybook resource",
        }),
        title: item.title || item.url || "Storybook resource",
        description: truncate(
          [item.url, formatStorybookAccessContext(item), item.note]
            .filter(Boolean)
            .join(" | "),
        ),
        group: SECTION_LABELS.storybook,
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
          label: item.label || item.url || "Amplify link",
        }),
        title: item.label || item.url || "Amplify link",
        description: truncate([item.url, item.note].filter(Boolean).join(" | ")),
        group: SECTION_LABELS.amplify,
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
          label: item.channelName || item.url || "Slack thread",
        }),
        title: item.channelName || item.url || "Slack thread",
        description: truncate([item.url, item.note].filter(Boolean).join(" | ")),
        group: SECTION_LABELS.slack,
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
          label: item.title || item.url || "Figma resource",
        }),
        title: item.title || item.url || "Figma resource",
        description: truncate(
          [item.nodeId ? `node ${item.nodeId}` : "", item.url, item.note]
            .filter(Boolean)
            .join(" | "),
        ),
        group: SECTION_LABELS.figma,
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
          label: field.label || "Custom field",
        }),
        title: field.label || "Custom field",
        description: truncate(`${field.type}: ${getCustomFieldValue(field)}`),
        group: SECTION_LABELS.custom,
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
      label: `${SECTION_LABELS[section]} item`,
    });
  }
  return createSectionReference(section);
}

export function extractWorkspaceInformationReferencesFromText(text: string) {
  const references: WorkspaceInformationReference[] = [];
  for (const match of text.matchAll(
    /@(?:info(?::[^\s.,;!?)]*)?|lens(?![A-Za-z0-9_-]))/gi,
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
  return buildWorkspaceInformationReferenceOptions(args.info).find((option) => {
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

function formatSectionItemLines(args: {
  info: WorkspaceInformationState;
  section: WorkspaceInformationReferenceSection;
  lens?: LensReferenceState | null;
}) {
  if (args.section === "lens") {
    return formatLensReferenceLines(args.lens);
  }
  const optionItems = buildWorkspaceInformationReferenceOptions(args.info)
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
  const omitted = buildWorkspaceInformationReferenceOptions(args.info).filter(
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
        `Section: ${SECTION_LABELS[reference.section]} (${reference.token})`,
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
    ? SECTION_LABELS[reference.section]
    : reference.label;
}
