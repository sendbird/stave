/**
 * Renderer state for `stave_request_secret`: the requests waiting for the user,
 * as metadata only. Main pushes the whole set on every change; a reload reads
 * it back with `list`. The value the user types never enters this store.
 *
 * Selectors return stored references only.
 */
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import {
  nextBoundSecretIds,
  type BindRequestedSecretOutcome,
  type PendingSecretRequest,
  type SecretRequestsBridgeApi,
} from "@/lib/secrets/secret-request";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";

interface SecretRequestsState {
  requests: PendingSecretRequest[];
}

export const useSecretRequestsStore = create<SecretRequestsState>()(() => ({
  requests: [],
}));

function secretRequestsApi(): SecretRequestsBridgeApi | null {
  return typeof window === "undefined" ? null : (window.api?.secretRequests ?? null);
}

let syncStarted = false;

/** Subscribe once for the app's lifetime and read the current set. */
function ensureSecretRequestSync() {
  if (syncStarted) return;
  const api = secretRequestsApi();
  if (!api) return;
  syncStarted = true;
  api.subscribeChanged((event) => useSecretRequestsStore.setState({ requests: event.requests }));
  void api
    .list()
    .then((result) => {
      if (result.ok) useSecretRequestsStore.setState({ requests: result.requests });
    })
    .catch(() => undefined);
}

/** The requests one task is waiting on, oldest first. */
export function useTaskSecretRequests(taskId: string) {
  useEffect(() => {
    ensureSecretRequestSync();
  }, []);
  const requests = useSecretRequestsStore((state) => state.requests);
  return useMemo(
    () => requests.filter((request) => request.taskId === taskId),
    [requests, taskId],
  );
}

/** The task's draft, in the active workspace or a cached one. */
function selectTaskDraft(state: AppState, taskId: string) {
  const workspaceId = state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
  const drafts =
    workspaceId && workspaceId !== state.activeWorkspaceId
      ? state.workspaceRuntimeCacheById[workspaceId]?.promptDraftByTask
      : state.promptDraftByTask;
  return drafts?.[taskId];
}

/** The task's bound secret ids, as stored. */
export function useTaskBoundSecretIds(taskId: string): string[] | undefined {
  return useAppStore((state) => selectTaskDraft(state, taskId)?.runtimeOverrides?.boundSecretIds);
}

/**
 * Bind a saved or reused secret to the task's draft, so the next turn sent
 * from this task resolves it to an environment variable. Ids only.
 */
export function bindRequestedSecretToTask(args: {
  taskId: string;
  secretId: string;
}): BindRequestedSecretOutcome {
  const draft = selectTaskDraft(useAppStore.getState(), args.taskId);
  const next = nextBoundSecretIds(draft?.runtimeOverrides?.boundSecretIds, args.secretId);
  if (next.outcome === "bound") {
    useAppStore.getState().updatePromptDraft({
      taskId: args.taskId,
      patch: {
        runtimeOverrides: { ...(draft?.runtimeOverrides ?? {}), boundSecretIds: next.ids },
      },
    });
  }
  return next.outcome;
}
