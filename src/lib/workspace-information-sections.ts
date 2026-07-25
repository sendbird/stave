import type { WorkspaceInformationState } from "./workspace-information";

export const WORKSPACE_INFORMATION_SECTION_IDS = [
  "overview",
  "todo",
  "note",
  "plans",
  "github",
  "jira",
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

export function resolveVisibleWorkspaceInformationSections(args: {
  visibility: WorkspaceInformationSectionVisibility;
  information: WorkspaceInformationState;
  planCount?: number;
}): WorkspaceInformationSectionId[] {
  const visibility = normalizeWorkspaceInformationSectionVisibility(
    args.visibility,
  );

  return WORKSPACE_INFORMATION_SECTION_IDS.filter((id) => {
    if (id === "overview") {
      return true;
    }
    const explicitVisibility = visibility[id];
    if (typeof explicitVisibility === "boolean") {
      return explicitVisibility;
    }
    return (
      CORE_SECTION_ID_SET.has(id) ||
      workspaceInformationSectionHasContent({
        id,
        information: args.information,
        planCount: args.planCount,
      })
    );
  });
}
