export type ChatAreaViewMode =
  | "no_project"
  | "hydrating_project"
  | "no_workspace"
  | "no_task"
  | "empty_task"
  | "conversation";

export function resolveChatAreaViewMode(args: {
  repositoryPath: string | null;
  hasHydratedWorkspaces: boolean;
  hasAnyWorkspace: boolean;
  hasSelectedWorkspace: boolean;
  hasSelectedTask: boolean;
  activeTaskMessageCount: number;
  /**
   * A send drawn before it is a message: a prompt waiting on Auto's classifier
   * or one that failed to send. Without it a new task's first prompt vanishes
   * behind the start screen until the turn begins.
   */
  hasUnsentPrompt?: boolean;
}): ChatAreaViewMode {
  if (!args.repositoryPath) {
    return "no_project";
  }
  if (!args.hasHydratedWorkspaces) {
    return "hydrating_project";
  }
  if (args.hasAnyWorkspace && !args.hasSelectedWorkspace) {
    return "no_workspace";
  }
  if (!args.hasSelectedTask) {
    return "no_task";
  }
  return args.activeTaskMessageCount === 0 && !args.hasUnsentPrompt
    ? "empty_task"
    : "conversation";
}

export function resolveHydratingRepositoryCopy(args: {
  persistenceBootstrapPhase: "idle" | "purging-legacy-turn-journal";
  persistenceBootstrapMessage: string;
}) {
  if (args.persistenceBootstrapPhase === "purging-legacy-turn-journal") {
    return {
      title: "Preparing local data",
      description:
        args.persistenceBootstrapMessage ||
        "Cleaning up legacy workspace data from a previous version. This only runs once.",
    };
  }

  return {
    title: "Opening workspace",
    description: "Loading tasks and recent conversation state for this repository.",
  };
}
