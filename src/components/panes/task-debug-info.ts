import type { TaskProviderSessionState, WorkspaceSummary } from "@/lib/db/workspaces.db";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "@/lib/providers/provider-accounts";
import { listProviderSessions } from "@/lib/providers/provider-sessions";
import { getConfiguredModelForProvider } from "@/store/prompt-draft-runtime";
import type { ChatMessage, Task } from "@/types/chat";

/**
 * Store slice the debug block is derived from. Kept structural so the builder
 * stays pure and testable without the Zustand store.
 */
export interface TaskDebugInfoState {
  tasks: readonly Task[];
  messagesByTask: Record<string, ChatMessage[] | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState | undefined>;
  taskWorkspaceIdById: Record<string, string | undefined>;
  activeWorkspaceId: string;
  workspaces: readonly WorkspaceSummary[];
  workspaceBranchById: Record<string, string | undefined>;
  workspacePathById: Record<string, string | undefined>;
  repositoryPath: string | null;
  recentRepositories: ReadonlyArray<{
    repositoryPath: string;
    workspaces: readonly WorkspaceSummary[];
  }>;
  settings: {
    modelClaude: string;
    modelCodex: string;
    modelCursor: string;
    modelKiro: string;
  };
}

/**
 * Model that produced the task's latest assistant turn, falling back to the
 * model configured for the task's provider when nothing has run yet.
 */
function resolveTaskModel(args: { state: TaskDebugInfoState; task: Task }) {
  const messages = args.state.messagesByTask[args.task.id] ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role !== "user" && message.model.trim()) {
      return message.model.trim();
    }
  }
  return getConfiguredModelForProvider(args.task.provider, args.state.settings);
}

function resolveRepositoryPath(args: { state: TaskDebugInfoState; workspaceId: string }) {
  const owner = args.state.recentRepositories.find((repository) =>
    repository.workspaces.some((workspace) => workspace.id === args.workspaceId),
  );
  return owner?.repositoryPath ?? args.state.repositoryPath ?? "";
}

/**
 * Build the plain-text block "Copy debug info" places on the clipboard. The
 * block is model-facing material for a bug-analysis prompt, so it is not
 * localized and every value is an identifier a maintainer can grep for.
 */
export function buildTaskDebugInfo(args: {
  state: TaskDebugInfoState;
  taskId: string;
  appVersion?: string | null;
}): string | null {
  const task = args.state.tasks.find((item) => item.id === args.taskId);
  if (!task) {
    return null;
  }
  const workspaceId =
    args.state.taskWorkspaceIdById[task.id] ?? args.state.activeWorkspaceId;
  const workspaceName = args.state.workspaces.find((workspace) => workspace.id === workspaceId)?.name;
  const branch = args.state.workspaceBranchById[workspaceId] ?? "";
  const workspaceRoot = args.state.workspacePathById[workspaceId] ?? "";
  const sessions = listProviderSessions({
    sessions: args.state.providerSessionByTask[task.id],
  });
  const sessionLines =
    sessions.length === 0
      ? ["session: none recorded"] // i18n-ignore: model-facing debug block
      : sessions.map((session) => {
          const account =
            session.accountProfileId === SYSTEM_ACCOUNT_PROFILE_ID
              ? ""
              : ` @${session.accountProfileId}`;
          return `session: ${session.providerId}${account} ${session.nativeSessionId}`;
        });

  return [
    "Stave debug info", // i18n-ignore: model-facing debug block
    `task: ${task.id} — ${task.title}`,
    `provider: ${task.provider} / ${resolveTaskModel({ state: args.state, task })}`,
    ...sessionLines,
    `workspace: ${workspaceId}${workspaceName ? ` ${workspaceName}` : ""} (${branch}) ${workspaceRoot}`.trimEnd(),
    `repo: ${resolveRepositoryPath({ state: args.state, workspaceId })}`,
    `app: Stave ${args.appVersion?.trim() || "unknown"}`,
  ].join("\n");
}
