import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChildTaskActionResponse,
  ChildTaskExpectedIdentity,
  ChildTaskSummary,
} from "@/lib/runs/child-task";
import {
  resolveChildTaskActionError,
  sortChildTaskRows,
} from "@/lib/runs/child-task-view";

/**
 * Reads the delegations a parent task owns and offers the controls the parent
 * surface exposes for them. The child's transcript is never read here: the
 * ledger only hands back identity, phase and reason, which is all a parent may
 * learn about a child task.
 */

const EMPTY_CHILDREN: readonly ChildTaskSummary[] = [];

const CHILD_TASK_UNAVAILABLE =
  "Child tasks are not available in this build. Open the desktop app to manage them.";

export interface ChildTaskActionResult {
  ok: boolean;
  error: string | null;
}

export interface ChildTaskPromptActionArgs {
  delegationKey: string;
  expected: ChildTaskExpectedIdentity;
  prompt: string;
}

export interface ChildTaskStopActionArgs {
  delegationKey: string;
  expected: ChildTaskExpectedIdentity;
}

export interface ChildTaskActions {
  followUp: (args: ChildTaskPromptActionArgs) => Promise<ChildTaskActionResult>;
  retry: (args: ChildTaskPromptActionArgs) => Promise<ChildTaskActionResult>;
  stop: (args: ChildTaskStopActionArgs) => Promise<ChildTaskActionResult>;
  detach: (args: ChildTaskStopActionArgs) => Promise<ChildTaskActionResult>;
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
export interface ChildTaskListingSource {
  children: readonly ChildTaskSummary[];
  actions: ChildTaskActions;
}

export interface UseChildTasksResult extends ChildTaskListingSource {
  loading: boolean;
  error: string | null;
}

function describeThrown(cause: unknown) {
  return cause instanceof Error && cause.message
    ? cause.message
    : "The child task action could not be delivered.";
}

export function useChildTasks(args: {
  parentTaskId: string | null | undefined;
  /** Required by retry, which restarts the delegation from the parent. */
  parentWorkspaceId?: string | null;
  projectPath?: string | null;
  enabled?: boolean;
}): UseChildTasksResult {
  const { parentTaskId, parentWorkspaceId, projectPath } = args;
  const enabled = args.enabled ?? true;
  const [children, setChildren] =
    useState<readonly ChildTaskSummary[]>(EMPTY_CHILDREN);
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
    if (!parentTaskId || !mountedRef.current) {
      return;
    }
    const listChildTasks = window.api?.runs?.listChildTasks;
    if (!listChildTasks) {
      return;
    }
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    setLoading(true);
    try {
      const listed = await listChildTasks({
        parentTaskId,
        includeFinished: true,
      });
      if (!mountedRef.current || sequence !== loadSequenceRef.current) {
        return;
      }
      setChildren(listed.length ? sortChildTaskRows(listed) : EMPTY_CHILDREN);
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
  }, [parentTaskId]);

  useEffect(() => {
    if (!enabled || !parentTaskId) {
      setChildren(EMPTY_CHILDREN);
      setError(null);
      setLoading(false);
      return;
    }
    void load();
    const subscribe = window.api?.runs?.onChildTasksChanged;
    if (!subscribe) {
      return;
    }
    // `load` is rebuilt whenever the parent task changes, so the listener never
    // closes over a task id the surface has already moved off.
    const unsubscribe = subscribe((payload) => {
      if (payload.parentTaskId !== parentTaskId) {
        return;
      }
      void load();
    });
    return () => {
      unsubscribe();
    };
  }, [enabled, load, parentTaskId]);

  const runAction = useCallback(
    async (
      invoke: (() => Promise<ChildTaskActionResponse>) | null,
    ): Promise<ChildTaskActionResult> => {
      if (!invoke) {
        return { ok: false, error: CHILD_TASK_UNAVAILABLE };
      }
      let response: ChildTaskActionResponse;
      try {
        response = await invoke();
      } catch (cause) {
        return { ok: false, error: describeThrown(cause) };
      }
      // A refusal usually means the delegation moved on, so the listing is
      // refreshed either way; the row shows the refusal sentence as-is.
      void load();
      const refusal = resolveChildTaskActionError(response);
      return refusal
        ? { ok: false, error: refusal }
        : { ok: true, error: null };
    },
    [load],
  );

  const actions = useMemo<ChildTaskActions>(() => {
    return {
      followUp: (input) => {
        const followUpChildTask = window.api?.runs?.followUpChildTask;
        return runAction(
          parentTaskId && followUpChildTask
            ? () =>
                followUpChildTask({
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
        const retryChildTask = window.api?.runs?.retryChildTask;
        if (!parentTaskId || !parentWorkspaceId || !projectPath) {
          return Promise.resolve({
            ok: false,
            error:
              "Retry needs the parent task's project and workspace. Open the parent task and try again.",
          });
        }
        return runAction(
          retryChildTask
            ? () =>
                retryChildTask({
                  projectPath,
                  parentWorkspaceId,
                  parentTaskId,
                  delegationKey: input.delegationKey,
                  prompt: input.prompt,
                  permissionProfile: "guided",
                  expected: input.expected,
                })
            : null,
        );
      },
      stop: (input) => {
        const stopChildTask = window.api?.runs?.stopChildTask;
        return runAction(
          parentTaskId && stopChildTask
            ? () =>
                stopChildTask({
                  parentTaskId,
                  delegationKey: input.delegationKey,
                  expected: input.expected,
                })
            : null,
        );
      },
      detach: (input) => {
        const detachChildTask = window.api?.runs?.detachChildTask;
        return runAction(
          parentTaskId && detachChildTask
            ? () =>
                detachChildTask({
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
  }, [load, parentTaskId, parentWorkspaceId, projectPath, runAction]);

  return { children, loading, error, actions };
}
