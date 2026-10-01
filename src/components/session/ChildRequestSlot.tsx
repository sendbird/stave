import { useEffect, useMemo, useState } from "react";
import { ConfirmationCompact } from "@/components/ai-elements/confirmation";
import { UserInputCard } from "@/components/ai-elements/user-input-card";
import { AgentIdentity } from "@/components/delegation/AgentIdentity";
import { sx } from "@/components/ads/utils/stylex";
import { loadChildInteraction } from "@/components/team/load-child-interaction";
import {
  respondToChildInteraction,
  type ChildInteractionResponse,
} from "@/components/team/respond-child-interaction";
import {
  selectDelegatedInteractionRequests,
  type DelegatedInteractionRequest,
} from "@/lib/notifications/delegated-attention";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import {
  findPendingApprovalMessageByRequestId,
  findPendingUserInputMessageByRequestId,
} from "@/store/provider-message.utils";
import type { ApprovalPart, ChatMessage, UserInputPart } from "@/types/chat";
import { childRequestSlotStyles as styles } from "./child-request-slot.styles";

const EMPTY_MESSAGES: ChatMessage[] = [];
/** Matches the composer approval queue: just past the provider's 30s acknowledgement. */
const DELIVERY_RETRY_MS = 32_000;

type ChildRequestIdentity = DelegatedInteractionRequest["identity"];

export interface ChildPendingRequest {
  messageId: string;
  part: ApprovalPart | UserInputPart;
  model: string | null;
}

/**
 * The child's request exactly as the notification recorded it: same turn,
 * same message, still waiting. Anything else is answered, expired, or belongs
 * to another turn, and gets no controls.
 */
export function findChildPendingRequest(args: {
  expected: ChildRequestIdentity;
  messages: ChatMessage[];
  activeTurnId: string | null;
}): ChildPendingRequest | null {
  const { expected, messages } = args;
  const found =
    expected.kind === "approval"
      ? findPendingApprovalMessageByRequestId({ messages, requestId: expected.requestId })
      : findPendingUserInputMessageByRequestId({ messages, requestId: expected.requestId });
  if (
    !found ||
    args.activeTurnId !== expected.turnId ||
    (expected.messageId && found.messageId !== expected.messageId)
  ) {
    return null;
  }
  const model = messages.find((message) => message.id === found.messageId)?.model;
  return { ...found, model: model?.trim() || null };
}

/**
 * Approvals and questions raised by tasks this one delegated, at any depth,
 * answered from this task's composer. Nothing here selects the child or
 * switches workspaces; the child's request is loaded on demand and answered
 * only while it still matches the identity the notification recorded.
 */
export function ChildRequestSlot(props: { taskId: string }) {
  const notifications = useAppStore((state) => state.notifications);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const requests = useMemo(
    () =>
      selectDelegatedInteractionRequests({
        notifications,
        taskId: props.taskId,
        repositoryPath,
        now: Date.now(),
      }),
    [notifications, props.taskId, repositoryPath],
  );
  const current = requests[0];
  if (!current) {
    return null;
  }
  return (
    <ChildRequestCard
      key={current.notificationId}
      request={current}
      queuedCount={requests.length - 1}
    />
  );
}

function ChildRequestCard(props: {
  request: DelegatedInteractionRequest;
  queuedCount: number;
}) {
  // The card is keyed by notification, so its identity is fixed for its life.
  const [expected] = useState(props.request.identity);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [childTask, messages, activeTurnId] = useChildRequestState(expected);

  useEffect(() => {
    let cancelled = false;
    loadChildInteraction(expected).then(
      () => {
        if (!cancelled) setLoaded(true);
      },
      (cause: unknown) => {
        if (cancelled) return;
        setLoaded(true);
        setError(cause instanceof Error ? cause.message : "This request could not be loaded.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [expected]);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setBusy(false), DELIVERY_RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [busy]);

  const pending = useMemo(
    () => findChildPendingRequest({ expected, messages, activeTurnId }),
    [activeTurnId, expected, messages],
  );

  function respond(response: ChildInteractionResponse) {
    if (busy) return;
    const result = respondToChildInteraction(expected, response);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    setBusy(true);
  }

  return (
    <ChildRequestView
      requestId={expected.requestId}
      childTitle={childTask?.title.trim() || props.request.childTaskTitle}
      providerId={childTask?.provider ?? props.request.providerId}
      pending={pending}
      queuedCount={props.queuedCount}
      busy={busy}
      error={error}
      loaded={loaded}
      onRespond={respond}
    />
  );
}

/** Presentation only, so the attribution and controls can be rendered from plain data. */
export function ChildRequestView(props: {
  requestId: string;
  childTitle: string;
  providerId: ProviderId | null;
  pending: ChildPendingRequest | null;
  queuedCount: number;
  busy: boolean;
  error: string | null;
  loaded: boolean;
  onRespond: (response: ChildInteractionResponse) => void;
}) {
  const { pending, busy, error } = props;
  const disabledReason = busy ? "Sending the response to the delegated task…" : undefined;
  const statusText = error
    ? error
    : busy
      ? "Waiting for the delegated task to accept the response…"
      : pending
        ? null
        : props.loaded
          ? "This request was answered or expired."
          : "Loading request…";

  return (
    <section
      aria-label="Requests from delegated tasks"
      className={sx(styles.section)}
      data-delegated-request-id={props.requestId}
    >
      <div className={sx(styles.header)}>
        <p className={sx(styles.attribution)}>
          <span className={sx(styles.eyebrow)}>Delegated task</span>
          <span className={sx(styles.childTitle)} title={props.childTitle}>
            {props.childTitle}
          </span>
          <AgentIdentity compact providerId={props.providerId} model={pending?.model} />
        </p>
        {props.queuedCount > 0 ? (
          <span className={sx(styles.queued)}>+{props.queuedCount} more</span>
        ) : null}
      </div>
      {pending?.part.type === "approval" ? (
        <ConfirmationCompact
          toolName={pending.part.toolName}
          description={pending.part.description}
          state={pending.part.state}
          disabled={busy}
          disabledReason={disabledReason}
          showShortcutHint={false}
          onApprove={() => props.onRespond({ kind: "approval", approved: true })}
          onReject={() => props.onRespond({ kind: "approval", approved: false })}
        />
      ) : null}
      {pending?.part.type === "user_input" ? (
        <UserInputCard
          toolName={pending.part.toolName}
          questions={pending.part.questions}
          state={pending.part.state}
          answers={pending.part.answers}
          disabled={busy}
          disabledReason={disabledReason}
          onSubmit={(answers) => props.onRespond({ kind: "user-input", answers })}
          onDeny={() => props.onRespond({ kind: "user-input", denied: true })}
        />
      ) : null}
      {statusText ? (
        <p
          role={error ? "alert" : "status"}
          aria-live="polite"
          className={sx(styles.status, error ? styles.error : null)}
        >
          {statusText}
        </p>
      ) : null}
    </section>
  );
}

/** Row-local reads of the child's live state; each selector returns a stored reference. */
function useChildRequestState(expected: ChildRequestIdentity) {
  const isActive = (state: ReturnType<typeof useAppStore.getState>) =>
    state.repositoryPath === expected.repositoryPath &&
    state.activeWorkspaceId === expected.workspaceId;
  const childTask = useAppStore((state) =>
    (isActive(state)
      ? state.tasks
      : state.workspaceRuntimeCacheById[expected.workspaceId]?.tasks
    )?.find((task) => task.id === expected.taskId),
  );
  const messages = useAppStore((state) =>
    isActive(state)
      ? state.messagesByTask[expected.taskId]
      : state.workspaceRuntimeCacheById[expected.workspaceId]?.messagesByTask[expected.taskId],
  );
  const activeTurnId = useAppStore((state) =>
    isActive(state)
      ? state.activeTurnIdsByTask[expected.taskId]
      : state.workspaceRuntimeCacheById[expected.workspaceId]?.activeTurnIdsByTask[expected.taskId],
  );
  return [childTask, messages ?? EMPTY_MESSAGES, activeTurnId ?? null] as const;
}
