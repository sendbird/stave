import type { StoreApi } from "zustand";
import { listProviderSessions } from "@/lib/providers/provider-sessions";
import { toProviderSessionTitle } from "@/lib/providers/thread-actions";
import { isTaskManaged } from "@/lib/tasks";
import type { AppState } from "@/store/app-store.types";
import { buildRecentTimestamp } from "@/store/chat-state-helpers";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

export function createTaskRenameAction(args: {
  set: StoreApi<AppState>["setState"];
  get: StoreApi<AppState>["getState"];
  persistWorkspaceSessionInBackground: (args: {
    workspaceId: string;
    session: WorkspaceSessionState;
  }) => void;
  incrementWorkspaceSnapshotVersion: (
    state: Pick<AppState, "workspaceSnapshotVersion">,
  ) => number;
}): AppState["renameTask"] {
  return ({ taskId, title, source = "manual" }) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const before = args.get();
    const workspaceId =
      before.taskWorkspaceIdById[taskId] ?? before.activeWorkspaceId;
    const beforeSession = getWorkspaceSessionForState({ state: before, workspaceId });
    let renamedSession: WorkspaceSessionState | undefined;
    args.set((state) => {
      const session = getWorkspaceSessionForState({ state, workspaceId });
      const target = session?.tasks.find((task) => task.id === taskId);
      if (
        !session || !target || isTaskManaged(target) ||
        (source === "auto" && (target.titleManuallySet || target.title === nextTitle))
      ) {
        return state;
      }
      renamedSession = {
        ...session,
        tasks: session.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                title: nextTitle,
                updatedAt: buildRecentTimestamp(),
                ...(source === "manual" ? { titleManuallySet: true } : {}),
              }
            : task,
        ),
      };
      return workspaceId === state.activeWorkspaceId
        ? {
            tasks: renamedSession.tasks,
            workspaceSnapshotVersion: args.incrementWorkspaceSnapshotVersion(state),
          }
        : {
            workspaceRuntimeCacheById: {
              ...state.workspaceRuntimeCacheById,
              [workspaceId]: renamedSession,
            },
          };
    });
    if (!renamedSession) return;
    args.persistWorkspaceSessionInBackground({ workspaceId, session: renamedSession });
    if (source !== "manual") return;

    const nativeSessionTitle = toProviderSessionTitle(nextTitle);
    const cwd =
      before.workspacePathById[workspaceId] ?? before.repositoryPath ?? undefined;
    const requests: Array<Promise<{ ok: boolean; detail: string }>> = [];
    for (const session of listProviderSessions({ sessions: beforeSession?.providerSessionByTask[taskId] })) {
      const runtimeOptions = {
        claudeAccountProfileId: session.accountProfileId,
        codexAccountProfileId: session.accountProfileId,
        claudeBinaryPath: before.settings.claudeBinaryPath || undefined,
        codexBinaryPath: before.settings.codexBinaryPath || undefined,
      };
      if (session.providerId === "claude-code" && window.api?.provider?.renameClaudeSession) {
        requests.push(window.api.provider.renameClaudeSession({
          sessionId: session.nativeSessionId, title: nativeSessionTitle, cwd, runtimeOptions,
        }));
      } else if (session.providerId === "codex" && window.api?.provider?.renameCodexThread) {
        requests.push(window.api.provider.renameCodexThread({
          threadId: session.nativeSessionId, name: nativeSessionTitle, runtimeOptions,
        }));
      }
    }
    if (requests.length > 0) {
      void Promise.all(requests)
        .then((results) => {
          for (const result of results) {
            if (!result.ok) {
              console.warn("[task-rename] Native session rename failed", { taskId, detail: result.detail });
            }
          }
        })
        .catch((error) => {
          console.warn("[task-rename] Native session rename failed", {
            taskId,
            detail: error instanceof Error ? error.message : String(error),
          });
        });
    }
  };
}
