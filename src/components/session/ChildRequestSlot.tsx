import { i18n, useTranslation } from "@/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { UserInputCard } from "@/components/ai-elements/user-input-card";
import { AgentIdentity } from "@/components/delegation/AgentIdentity";
import { sx } from "@/components/aui/utils/stylex";
import {
  isFleetRequestShown,
  loadFleetInteraction,
  loadFleetRequestFromOlderMessages,
} from "@/lib/fleet/interaction-load";
import {
  fleetInteractionOutlivesTurn,
  respondToFleetInteraction,
  type FleetInteractionResponse,
} from "@/lib/fleet/interaction-respond";
import { toast } from "@/lib/notifications/toast";
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
import {
  APPROVAL_DELIVERY_GUARD_MS,
  ToolApprovalCard,
} from "./ToolApprovalCard";

const EMPTY_MESSAGES: ChatMessage[] = [];

type ChildRequestIdentity = DelegatedInteractionRequest["identity"];

export interface ChildPendingRequest {
  messageId: string;
  part: ApprovalPart | UserInputPart;
  model: string | null;
}

/**
 * The child's request exactly as the notification recorded it: same message,
 * still waiting, and in the same turn. An asynchronous question did not pause
 * its turn and can still be answered after it ends, so it is matched without
 * the turn, as sending it is (`respondToFleetInteraction`). Anything else is
 * answered, expired, or belongs to another turn, and gets no controls.
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
    (expected.messageId && found.messageId !== expected.messageId) ||
    (!fleetInteractionOutlivesTurn(found.part) && args.activeTurnId !== expected.turnId)
  ) {
    return null;
  }
  const model = messages.find((message) => message.id === found.messageId)?.model;
  return { ...found, model: model?.trim() || null };
}

/**
 * Whether the loaded state proves the request is over, the rule a Fleet row
 * uses before it says "answered or expired": the child is loaded, nothing
 * pending matches, and its message is in the loaded window (or every message
 * is). A session can hold only its latest page, so a request missing from it
 * is not evidence of anything.
 */
export function isChildRequestSettled(args: {
  expected: ChildRequestIdentity;
  taskLoaded: boolean;
  messages: ChatMessage[] | undefined;
  messageCount: number | undefined;
  activeTurnId: string | null;
}) {
  const { expected, messages } = args;
  if (!args.taskLoaded || !messages) return false;
  if (findChildPendingRequest({ expected, messages, activeTurnId: args.activeTurnId })) return false;
  return isFleetRequestShown(messages, expected) || messages.length >= (args.messageCount ?? 0);
}

/**
 * Approvals and questions raised by tasks this one delegated, at any depth,
 * answered from this task's composer. Nothing here selects the child or
 * switches workspaces; the child's request is loaded on demand and answered
 * only while it still matches the identity the notification recorded.
 */
export function ChildRequestSlot(props: { taskId: string }) {
  useTranslation();
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

/**
 * Closes a child request that has nothing left to answer by settling the
 * notification its card is keyed by, the same way the task window settles a
 * request that can no longer be answered. The write persists, so the card does
 * not return on the next render or app start, and the next queued request
 * takes its place. When the write fails the store puts the notification back,
 * so the card returns at once and can be closed again.
 */
export async function dismissChildRequest(notificationId: string) {
  const saved = await useAppStore
    .getState()
    .markNotificationRead({ id: notificationId, resolvedAt: new Date().toISOString() });
  if (!saved) {
    toast.error(i18n.t("session:childRequestSlot.dismissFailed"));
  }
  return saved;
}

function ChildRequestCard(props: {
  request: DelegatedInteractionRequest;
  queuedCount: number;
}) {
  useTranslation();
  // The card is keyed by notification, so its identity is fixed for its life.
  const [expected] = useState(props.request.identity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { childTask, messages, messageCount, activeTurnId } = useChildRequestState(expected);
  const pending = useMemo(
    () => findChildPendingRequest({ expected, messages: messages ?? EMPTY_MESSAGES, activeTurnId }),
    [activeTurnId, expected, messages],
  );
  const settled = useMemo(
    () => isChildRequestSettled({ expected, taskLoaded: Boolean(childTask), messages, messageCount, activeTurnId }),
    [activeTurnId, childTask, expected, messageCount, messages],
  );
  // Nothing is read when the request is already loaded, pending or not; like
  // a Fleet row, a cold child loads first, then older pages until it shows.
  const loadedAtMount = useRef(Boolean(pending) || settled);
  const [loadDone, setLoadDone] = useState(loadedAtMount.current);

  useEffect(() => {
    if (loadedAtMount.current) return;
    let cancelled = false;
    loadFleetInteraction(expected)
      .then(() => loadFleetRequestFromOlderMessages(expected))
      .then(
        () => {
          if (!cancelled) setLoadDone(true);
        },
        (cause: unknown) => {
          if (cancelled) return;
          setLoadDone(true);
          setError(cause instanceof Error ? cause.message : i18n.t("session:childRequestSlot.extraCopy88"));
        },
      );
    return () => {
      cancelled = true;
    };
  }, [expected]);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(
      () => setBusy(false),
      APPROVAL_DELIVERY_GUARD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [busy]);

  function respond(response: FleetInteractionResponse) {
    if (busy) return;
    const result = respondToFleetInteraction(expected, response);
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
      // Loaded but neither pending nor provably over (its message is older
      // than every page read): say so instead of guessing either way.
      error={error ?? (loadDone && !pending && !settled ? i18n.t("session:childRequestSlot.extraCopy88") : null)}
      settled={settled}
      onRespond={respond}
      onDismiss={() => void dismissChildRequest(props.request.notificationId)}
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
  /** The loaded state proves the request is over (`isChildRequestSettled`). */
  settled: boolean;
  onRespond: (response: FleetInteractionResponse) => void;
  /** Hides a request that has nothing left to answer. */
  onDismiss?: () => void;
}) {
  useTranslation();
  const { pending, busy, error } = props;
  const disabledReason = busy ? i18n.t("session:childRequestSlot.extraCopy89") : undefined;
  const statusText = error
    ? error
    : busy
      ? i18n.t("session:childRequestSlot.statusText")
      : pending
        ? null
        : props.settled
          ? i18n.t("session:childRequestSlot.statusText2")
          : i18n.t("session:childRequestSlot.statusText3");
  // Only a request the loaded state proves over can be closed. A pending one is
  // answered or denied, one being delivered settles on its own, and one that
  // could not be read may still be waiting, so closing it would hide a live
  // request from this composer and from Fleet.
  const dismissible = Boolean(props.onDismiss) && props.settled && !pending && !busy && !error;

  return (
    <section
      aria-label={i18n.t("session:childRequestSlot.ariaLabel")}
      className={sx(styles.section, pending?.part.type === "user_input" ? styles.sectionCapped : null)}
      data-delegated-request-id={props.requestId}
    >
      <div className={sx(styles.header)}>
        <p className={sx(styles.attribution)}>
          <span className={sx(styles.eyebrow)}>{i18n.t("session:childRequestSlot.childRequestView")}</span>
          <span className={sx(styles.childTitle)} title={props.childTitle}>
            {props.childTitle}
          </span>
          <AgentIdentity compact providerId={props.providerId} model={pending?.model} />
        </p>
        {props.queuedCount > 0 ? (
          <span className={sx(styles.queued)}>+{props.queuedCount} {i18n.t("session:childRequestSlot.childRequestView2")}</span>
        ) : null}
        {dismissible ? (
          <Button
            variant="quiet"
            size="xs"
            iconOnly
            aria-label={i18n.t("session:childRequestSlot.dismiss")}
            title={i18n.t("session:childRequestSlot.dismiss")}
            xstyle={[styles.dismiss, props.queuedCount > 0 ? null : styles.dismissEnd]}
            onClick={props.onDismiss}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {pending?.part.type === "approval" ? (
        // A child's approval is delivered through the delegating host, which
        // does not carry a standing grant, so "Always allow" is not offered.
        <ToolApprovalCard
          allowAlways={false}
          busy={busy}
          density="compact"
          onDecide={(decision) =>
            props.onRespond({ kind: "approval", approved: decision.approved })
          }
          part={pending.part}
        />
      ) : null}
      {pending?.part.type === "user_input" ? (
        <UserInputCard key={pending.part.requestId}
          toolName={pending.part.toolName}
          questions={pending.part.questions}
          state={pending.part.state}
          answers={pending.part.answers}
          presentation="embedded"
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
  const session = (state: ReturnType<typeof useAppStore.getState>) =>
    isActive(state) ? state : state.workspaceRuntimeCacheById[expected.workspaceId];
  const childTask = useAppStore((state) =>
    session(state)?.tasks.find((task) => task.id === expected.taskId),
  );
  const messages = useAppStore((state) => session(state)?.messagesByTask[expected.taskId]);
  const messageCount = useAppStore((state) => session(state)?.messageCountByTask[expected.taskId]);
  const activeTurnId = useAppStore((state) => session(state)?.activeTurnIdsByTask[expected.taskId]);
  return { childTask, messages, messageCount, activeTurnId: activeTurnId ?? null };
}
