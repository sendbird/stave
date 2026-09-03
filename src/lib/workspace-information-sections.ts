import type { WorkspaceInformationState } from "./workspace-information";

export const WORKSPACE_INFORMATION_SECTION_IDS = [
  "overview",
  "todo",
  "note",
  "plans",
  "github",
  "jira",
  "crane",
  "confluence",
  "storybook",
  "amplify",
  "slack",
  "figma",
  "custom",
] as const;

export type WorkspaceInformationSectionId =
  (typeof WORKSPACE_INFORMATION_SECTION_IDS)[number];

export const WORKSPACE_INFORMATION_SECTION_LABELS: Record<
  WorkspaceInformationSectionId,
  string
> = {
  overview: "Summary",
  todo: "Todos",
  note: "Notes",
  plans: "Plans",
  github: "GitHub",
  jira: "Jira",
  crane: "Crane",
  confluence: "Confluence",
  storybook: "Storybook",
  amplify: "Amplify",
  slack: "Slack",
  figma: "Figma",
  custom: "Custom fields",
};

export const CORE_WORKSPACE_INFORMATION_SECTIONS = [
  "overview",
  "todo",
  "note",
  "plans",
  "github",
  "custom",
] as const satisfies readonly WorkspaceInformationSectionId[];

export type WorkspaceInformationSectionVisibility = Partial<
  Record<WorkspaceInformationSectionId, boolean>
>;

const SECTION_ID_SET = new Set<string>(WORKSPACE_INFORMATION_SECTION_IDS);
const CORE_SECTION_ID_SET = new Set<WorkspaceInformationSectionId>(
  CORE_WORKSPACE_INFORMATION_SECTIONS,
);

export function parseWorkspaceInformationOpenSections(
  raw: string | null,
): WorkspaceInformationSectionId[] {
  if (!raw) {
    return ["overview"];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return ["overview"];
    }

    return parsed.filter(
      (value): value is WorkspaceInformationSectionId =>
        typeof value === "string" && SECTION_ID_SET.has(value),
    );
  } catch {
    return ["overview"];
  }
}

export function normalizeWorkspaceInformationSectionVisibility(
  value: unknown,
): WorkspaceInformationSectionVisibility {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: WorkspaceInformationSectionVisibility = {};
  for (const [id, visible] of Object.entries(value)) {
    if (SECTION_ID_SET.has(id) && typeof visible === "boolean") {
      normalized[id as WorkspaceInformationSectionId] = visible;
    }
  }
  return normalized;
}

export function workspaceInformationSectionHasContent(args: {
  id: WorkspaceInformationSectionId;
  information: WorkspaceInformationState;
  planCount?: number;
}): boolean {
  switch (args.id) {
    case "overview":
      return Boolean(args.information.turnSummary);
    case "todo":
      return args.information.todos.length > 0;
    case "note":
      return args.information.notes.trim().length > 0;
    case "plans":
      return (args.planCount ?? 0) > 0;
    case "github":
      return args.information.linkedPullRequests.length > 0;
    case "jira":
      return args.information.jiraIssues.length > 0;
    case "crane":
      return (args.information.craneIssues ?? []).length > 0;
    case "confluence":
      return args.information.confluencePages.length > 0;
    case "storybook":
      return args.information.storybookResources.length > 0;
    case "amplify":
      return args.information.amplifyLinks.length > 0;
    case "slack":
      return args.information.slackThreads.length > 0;
    case "figma":
      return args.information.figmaResources.length > 0;
    case "custom":
      return args.information.customFields.length > 0;
  }
}

/**
 * Sections owned by a tracker connector, and whether that connector is on.
 *
 * A user who has just connected a tracker expects its section to be there
 * before the first ticket lands, so an enabled connector makes its section
 * default-visible the same way a core section is. A disabled connector adds
 * nothing, which keeps the connector-less behaviour byte-for-byte identical.
 */
function isTrackerConnectorSectionEnabled(args: {
  id: WorkspaceInformationSectionId;
  craneConnectorEnabled?: boolean;
  jiraConnectorEnabled?: boolean;
}): boolean {
  switch (args.id) {
    case "crane":
      return Boolean(args.craneConnectorEnabled);
    case "jira":
      return Boolean(args.jiraConnectorEnabled);
    default:
      return false;
  }
}

/**
 * Sections that stay hidden unless the integration behind them is switched on.
 * A leftover explicit `true` in stored visibility must not resurrect them, so
 * the gate is checked before the visibility override.
 */
export function isWorkspaceInformationSectionAvailable(args: {
  id: WorkspaceInformationSectionId;
  information: WorkspaceInformationState;
  craneConnectorEnabled?: boolean;
}): boolean {
  if (args.id !== "crane") {
    return true;
  }
  // Still shown when entries exist, so disabling the connector never hides data
  // the user already has.
  return (
    Boolean(args.craneConnectorEnabled) ||
    (args.information.craneIssues ?? []).length > 0
  );
}

export function resolveVisibleWorkspaceInformationSections(args: {
  visibility: WorkspaceInformationSectionVisibility;
  information: WorkspaceInformationState;
  planCount?: number;
  craneConnectorEnabled?: boolean;
  jiraConnectorEnabled?: boolean;
}): WorkspaceInformationSectionId[] {
  const visibility = normalizeWorkspaceInformationSectionVisibility(
    args.visibility,
  );

  return WORKSPACE_INFORMATION_SECTION_IDS.filter((id) => {
    if (id === "overview") {
      return true;
    }
    if (
      !isWorkspaceInformationSectionAvailable({
        id,
        information: args.information,
        craneConnectorEnabled: args.craneConnectorEnabled,
      })
    ) {
      return false;
    }
    const explicitVisibility = visibility[id];
    if (typeof explicitVisibility === "boolean") {
      return explicitVisibility;
    }
    return (
      CORE_SECTION_ID_SET.has(id) ||
      isTrackerConnectorSectionEnabled({
        id,
        craneConnectorEnabled: args.craneConnectorEnabled,
        jiraConnectorEnabled: args.jiraConnectorEnabled,
      }) ||
      workspaceInformationSectionHasContent({
        id,
        information: args.information,
        planCount: args.planCount,
      })
    );
  });
}
