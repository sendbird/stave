import { i18n } from "@/i18n/runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DelegatedTaskActionResponse,
  DelegatedTaskExpectedIdentity,
  DelegatedTaskSummary,
} from "@/lib/runs/delegated-task";
import {
  resolveDelegatedTaskActionError,
  sortDelegatedTaskRows,
} from "@/lib/runs/delegated-task-view";

/**
 * Reads the delegations a parent task owns and offers the controls the parent
 * surface exposes for them. The child's transcript is never read here: the
 * ledger only hands back identity, phase and reason, which is all a parent may
 * learn about a delegated task.
 */

const EMPTY_CHILDREN: readonly DelegatedTaskSummary[] = [];

const DELEGATED_TASK_UNAVAILABLE =
  "session:useDelegatedTasks.extraCopy204";

export interface DelegatedTaskActionResult {
  ok: boolean;
  error: string | null;
}

export interface DelegatedTaskPromptActionArgs {
  delegationKey: string;
  expected: DelegatedTaskExpectedIdentity;
  prompt: string;
}

export interface DelegatedTaskStopActionArgs {
  delegationKey: string;
  expected: DelegatedTaskExpectedIdentity;
}

export interface DelegatedTaskActions {
  followUp: (args: DelegatedTaskPromptActionArgs) => Promise<DelegatedTaskActionResult>;
  retry: (args: DelegatedTaskPromptActionArgs) => Promise<DelegatedTaskActionResult>;
  stop: (args: DelegatedTaskStopActionArgs) => Promise<DelegatedTaskActionResult>;
  detach: (args: DelegatedTaskStopActionArgs) => Promise<DelegatedTaskActionResult>;
  refresh: () => void;
}

/**
 * The half of the listing a consumer needs to render rows and act on them.
 *
 * Split out from the full result so a surface can pass it down without dragging
 * `loading` along: that flag flips twice per refetch, and a component memoized
 * on the whole result would re-render on every refresh whether or not the rows
 * changed.
 */
export interface DelegatedTaskListingSource {
  children: readonly DelegatedTaskSummary[];
  actions: DelegatedTaskActions;
}

export interface UseDelegatedTasksResult extends DelegatedTaskListingSource {
  loading: boolean;
  error: string | null;
}

function describeThrown(cause: unknown) {
  return cause instanceof Error && cause.message
    ? cause.message
    : i18n.t("session:useDelegatedTasks.describeThrown");
}

export function useDelegatedTasks(args: {
  parentTaskId: string | null | undefined;
  /** Required by retry, which restarts the delegation from the parent. */
  parentWorkspaceId?: string | null;
  repositoryPath?: string | null;
  enabled?: boolean;
}): UseDelegatedTasksResult {
  const { parentTaskId, parentWorkspaceId, repositoryPath } = args;
  const enabled = args.enabled ?? true;
  const [children, setChildren] =
    useState<readonly DelegatedTaskSummary[]>(EMPTY_CHILDREN);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  // A refetch can be triggered by the ledger, by a control, and by a parent
  // task switch at the same time. Only the newest request may write state, so a
  // slow earlier listing can never resurrect a stale row set.
  const loadSequenceRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled || !parentTaskId || !mountedRef.current) {
      return;
    }
    const listDelegatedTasks = window.api?.runs?.listDelegatedTasks;
    if (!listDelegatedTasks) {
      return;
    }
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    setLoading(true);
    try {
      const listed = await listDelegatedTasks({
        parentTaskId,
        includeFinished: true,
      });
      if (!mountedRef.current || sequence !== loadSequenceRef.current) {
        return;
      }
      setChildren(listed.length ? sortDelegatedTaskRows(listed) : EMPTY_CHILDREN);
      setError(null);
    } catch (cause) {
      if (!mountedRef.current || sequence !== loadSequenceRef.current) {
        return;
      }
      setError(describeThrown(cause));
    } finally {
      if (mountedRef.current && sequence === loadSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, parentTaskId]);

  useEffect(() => {
    // Changing scope or hiding a surface invalidates in-flight listings too.
    ++loadSequenceRef.current;
    setChildren(EMPTY_CHILDREN);
    setError(null);
    setLoading(false);
    if (enabled && parentTaskId) void load();
    const unsubscribe =
      enabled && parentTaskId
        ? window.api?.runs?.onDelegatedTasksChanged?.((payload) => {
            if (payload.parentTaskId === parentTaskId) void load();
          })
        : undefined;
    return () => {
      ++loadSequenceRef.current;
      unsubscribe?.();
    };
  }, [enabled, load, parentTaskId]);

  const runAction = useCallback(
    async (
      invoke: (() => Promise<DelegatedTaskActionResponse>) | null,
    ): Promise<DelegatedTaskActionResult> => {
      if (!invoke) {
        return { ok: false, error: i18n.t(DELEGATED_TASK_UNAVAILABLE) };
      }
      let response: DelegatedTaskActionResponse;
      try {
        response = await invoke();
      } catch (cause) {
        return { ok: false, error: describeThrown(cause) };
      }
      // A refusal usually means the delegation moved on, so the listing is
      // refreshed either way; the row shows the refusal sentence as-is.
      void load();
      const refusal = resolveDelegatedTaskActionError(response);
      return refusal
        ? { ok: false, error: refusal }
        : { ok: true, error: null };
    },
    [load],
  );

  const actions = useMemo<DelegatedTaskActions>(() => {
    return {
      followUp: (input) => {
        const followUpDelegatedTask = window.api?.runs?.followUpDelegatedTask;
        return runAction(
          parentTaskId && followUpDelegatedTask
            ? () =>
                followUpDelegatedTask({
                  parentTaskId,
                  delegationKey: input.delegationKey,
                  prompt: input.prompt,
                  permissionProfile: "guided",
                  expected: input.expected,
                })
            : null,
        );
      },
      retry: (input) => {
        const retryDelegatedTask = window.api?.runs?.retryDelegatedTask;
        if (!parentTaskId || !parentWorkspaceId || !repositoryPath) {
          return Promise.resolve({
            ok: false,
            error:
              i18n.t("session:useDelegatedTasks.extraCopy205"),
          });
        }
        return runAction(
          retryDelegatedTask
            ? () =>
                retryDelegatedTask({
                  repositoryPath,
                  parentWorkspaceId,
                  parentTaskId,
                  delegationKey: input.delegationKey,
                  prompt: input.prompt,
                  // No profile on purpose: the coordinator treats an explicit
                  // profile as an override and otherwise preserves the child's
                  // original one.
                  expected: input.expected,
                })
            : null,
        );
      },
      stop: (input) => {
        const stopDelegatedTask = window.api?.runs?.stopDelegatedTask;
        return runAction(
          parentTaskId && stopDelegatedTask
            ? () =>
                stopDelegatedTask({
                  parentTaskId,
                  delegationKey: input.delegationKey,
                  expected: input.expected,
                })
            : null,
        );
      },
      detach: (input) => {
        const detachDelegatedTask = window.api?.runs?.detachDelegatedTask;
        return runAction(
          parentTaskId && detachDelegatedTask
            ? () =>
                detachDelegatedTask({
                  parentTaskId,
                  delegationKey: input.delegationKey,
                  expected: input.expected,
                })
            : null,
        );
      },
      refresh: () => {
        void load();
      },
    };
  }, [load, parentTaskId, parentWorkspaceId, repositoryPath, runAction]);

  return { children, loading, error, actions };
}
