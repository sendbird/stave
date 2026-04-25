import type { RecentProjectState } from "@/store/project.utils";

function normalizeProjectPath(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/**
 * Radix overlays such as SelectContent render in a portal, so their mouse events
 * still bubble through the React tree. Only close Settings when the backdrop
 * itself was the direct mouse target.
 */
export function shouldCloseSettingsDialogFromMouseDown(args: {
  target: EventTarget | null;
  currentTarget: EventTarget | null;
}) {
  return args.target === args.currentTarget;
}

function hasProjectPath(args: {
  projects: RecentProjectState[];
  projectPath: string | null;
}) {
  if (!args.projectPath) {
    return false;
  }
  return args.projects.some((project) => project.projectPath === args.projectPath);
}

/**
 * Resolves which project should stay selected in Settings > Projects.
 */
export function resolveSettingsProjectSelection(args: {
  projects: RecentProjectState[];
  selectedProjectPath?: string | null;
  highlightedProjectPath?: string | null;
  currentProjectPath?: string | null;
  allowHighlightedOverride?: boolean;
}) {
  const selectedProjectPath = normalizeProjectPath(args.selectedProjectPath);
  const highlightedProjectPath = normalizeProjectPath(args.highlightedProjectPath);
  const currentProjectPath = normalizeProjectPath(args.currentProjectPath);

  if (args.projects.length === 0) {
    return null;
  }

  if (hasProjectPath({ projects: args.projects, projectPath: selectedProjectPath })) {
    return selectedProjectPath;
  }

  if (
    args.allowHighlightedOverride !== false
    && hasProjectPath({ projects: args.projects, projectPath: highlightedProjectPath })
  ) {
    return highlightedProjectPath;
  }

  if (hasProjectPath({ projects: args.projects, projectPath: currentProjectPath })) {
    return currentProjectPath;
  }

  return args.projects[0]?.projectPath ?? null;
}
