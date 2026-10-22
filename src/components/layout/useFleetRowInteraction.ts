import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APPROVAL_DELIVERY_GUARD_MS } from "@/components/session/ToolApprovalCard";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import type {
  FleetControlValidation,
  FleetInteractionControlIdentity,
} from "@/lib/fleet/control-plane";
import {
  classifyFleetInlineInteraction,
  type FleetInlineInteraction,
} from "@/lib/fleet/inline-interaction";
import {
  isFleetRequestShown,
  loadFleetInteraction,
  loadFleetRequestFromOlderMessages,
} from "@/lib/fleet/interaction-load";
import {
  respondToFleetInteraction,
  type FleetInteractionResponse,
} from "@/lib/fleet/interaction-respond";
import { isTaskManaged } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";
import {
  findPendingApprovalMessageByRequestId,
  findPendingUserInputMessageByRequestId,
} from "@/store/provider-message.utils";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

type AppState = ReturnType<typeof useAppStore.getState>;
type SessionSlice = Pick<
  WorkspaceSessionState,
  "tasks" | "messagesByTask" | "messageCountByTask" | "activeTurnIdsByTask"
>;

/** The request a Fleet row names, or `null` for rows that hold no request. */
export function toFleetInteractionIdentity(
  item: Pick<
    FleetAttentionItem,
    | "kind"
    | "repositoryPath"
    | "workspaceId"
    | "taskId"
    | "turnId"
    | "requestId"
    | "messageId"
  >,
): FleetInteractionControlIdentity | null {
  if (
    (item.kind !== "approval" && item.kind !== "user-input") ||
    !item.taskId ||
    !item.requestId
  ) {
    return null;
  }
  return {
    repositoryPath: item.repositoryPath,
    workspaceId: item.workspaceId,
    taskId: item.taskId,
    turnId: item.turnId ?? null,
    kind: item.kind,
    requestId: item.requestId,
    messageId: item.messageId ?? null,
  };
}

/**
 * The session that owns the request: the active workspace's, or the runtime
 * cache's for another workspace of the open repository. A request of another
 * repository has none here.
 */
function selectOwningSession(
  state: AppState,
  identity: FleetInteractionControlIdentity | null,
): SessionSlice | undefined {
  if (!identity || state.repositoryPath !== identity.repositoryPath) {
    return undefined;
  }
  return state.activeWorkspaceId === identity.workspaceId
    ? state
    : state.workspaceRuntimeCacheById[identity.workspaceId];
}

export interface FleetRowInteraction {
  identity: FleetInteractionControlIdentity | null;
  /** How the request can be answered in the row. */
  inline: FleetInlineInteraction;
  /** The request is loaded and still pending. */
  pending: boolean;
  /** The request's repository is not open: the row offers Open only. */
  otherRepository: boolean;
  /**
   * The task shows the request's message and it is no longer pending, or every
   * message is loaded and the request is not among them.
   */
  settled: boolean;
  loading: boolean;
  error: string | null;
  /** An answer was sent and the request has not left pending yet. */
  busy: boolean;
  managed: boolean;
  /** Loads a cold task of the open repository; call on focus or expansion. */
  ensureLoaded: () => void;
  respond: (response: FleetInteractionResponse) => FleetControlValidation;
}

/**
 * A Fleet row's view of the request it names, read row-locally from the
 * session that owns it. Nothing is loaded until the row is focused or
 * expanded; an answer is validated against the store at the moment it is
 * sent, and the row stays busy until the request leaves pending or the
 * delivery guard passes.
 */
export function useFleetRowInteraction(
  item: FleetAttentionItem,
): FleetRowInteraction {
  // Items are rebuilt on every projection; the identity only changes with them.
  const { kind, repositoryPath, workspaceId, turnId, requestId, messageId } = item;
  const itemTaskId = item.taskId;
  const identity = useMemo(
    () =>
      toFleetInteractionIdentity({
        kind,
        repositoryPath,
        workspaceId,
        taskId: itemTaskId,
        turnId,
        requestId,
        messageId,
      }),
    [kind, repositoryPath, workspaceId, itemTaskId, turnId, requestId, messageId],
  );
  const taskId = identity?.taskId;
  const otherRepository = useAppStore((state) =>
    identity ? state.repositoryPath !== identity.repositoryPath : false,
  );
  const messages = useAppStore((state) =>
    taskId ? selectOwningSession(state, identity)?.messagesByTask[taskId] : undefined,
  );
  const task = useAppStore((state) =>
    taskId
      ? selectOwningSession(state, identity)?.tasks.find(
          (candidate) => candidate.id === taskId,
        )
      : undefined,
  );
  const activeTurnId = useAppStore((state) =>
    taskId
      ? selectOwningSession(state, identity)?.activeTurnIdsByTask[taskId]
      : undefined,
  );
  const messageCount = useAppStore((state) =>
    taskId
      ? selectOwningSession(state, identity)?.messageCountByTask[taskId]
      : undefined,
  );
  // Answerable means what sending checks: still pending, in the message and
  // turn the row names (an async question may outlive its turn).
  const part = useMemo(() => {
    if (!identity || !messages) {
      return null;
    }
    const found =
      identity.kind === "approval"
        ? findPendingApprovalMessageByRequestId({
            messages,
            requestId: identity.requestId,
          })
        : findPendingUserInputMessageByRequestId({
            messages,
            requestId: identity.requestId,
          });
    if (!found || (identity.messageId && found.messageId !== identity.messageId)) {
      return null;
    }
    const outlivesTurn =
      found.part.type === "user_input" && found.part.delivery === "async";
    if (identity.turnId && !outlivesTurn && activeTurnId !== identity.turnId) {
      return null;
    }
    return found.part;
  }, [activeTurnId, identity, messages]);
  const inline = useMemo(() => classifyFleetInlineInteraction(part), [part]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentRequestId, setSentRequestId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const busy = Boolean(part) && sentRequestId === identity?.requestId;
  useEffect(() => {
    if (!busy) {
      return;
    }
    // A delivery that failed silently must not leave the row locked.
    const timer = window.setTimeout(
      () => setSentRequestId(null),
      APPROVAL_DELIVERY_GUARD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [busy]);

  const loaded = Boolean(task && messages);
  // Loaded messages can be only the latest page; the request may be older.
  const shown = Boolean(identity && messages && isFleetRequestShown(messages, identity));
  const searched = loaded && (shown || (messages?.length ?? 0) >= (messageCount ?? 0));
  const ensureLoaded = useCallback(() => {
    if (!identity || part || searched || loading || otherRepository) {
      return;
    }
    setLoading(true);
    setError(null);
    // A cold task loads first; then older pages until the request shows.
    (loaded ? Promise.resolve() : loadFleetInteraction(identity))
      .then(() => loadFleetRequestFromOlderMessages(identity))
      .then(
        () => {
          if (mountedRef.current) setLoading(false);
        },
        (cause: unknown) => {
          if (!mountedRef.current) return;
          setLoading(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        },
      );
  }, [identity, loaded, loading, otherRepository, part, searched]);

  const respond = useCallback(
    (response: FleetInteractionResponse): FleetControlValidation => {
      if (!identity) {
        return { ok: false, reason: "" };
      }
      const result = respondToFleetInteraction(identity, response);
      if (result.ok) {
        setError(null);
        setSentRequestId(identity.requestId);
      } else {
        setError(result.reason);
      }
      return result;
    },
    [identity],
  );

  return {
    identity,
    inline,
    pending: Boolean(part),
    otherRepository,
    settled:
      searched && !part && sentRequestId !== identity?.requestId && !loading,
    loading,
    error,
    busy,
    managed: isTaskManaged(task ?? null),
    ensureLoaded,
    respond,
  };
}
