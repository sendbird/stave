import { i18n } from "@/i18n/runtime";
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
   * A send drawn before it is a message: a prompt waiting on Auto's
   * classifier, an Agent-mode prompt waiting on its run to write it, or one
   * that failed to send. Without it a new task's first prompt vanishes behind
   * the start screen until the turn begins.
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
      title: i18n.t("session:chatAreaUtils.title"),
      description:
        args.persistenceBootstrapMessage ||
        i18n.t("session:chatAreaUtils.description"),
    };
  }

  return {
    title: i18n.t("session:chatAreaUtils.title2"),
    description: i18n.t("session:chatAreaUtils.description2"),
  };
}
