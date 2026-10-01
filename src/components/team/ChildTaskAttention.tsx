import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { FleetTaskControlPanel } from "@/components/layout/FleetTaskControlPanel";
import type { FleetInteractionControlIdentity } from "@/lib/fleet/control-plane";
import { getNotificationInteractionRequestId, getNotificationInteractionMessageId } from "@/lib/notifications/attention-reconcile";
import { isActiveDelegatedTaskPhase, type DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { useAppStore } from "@/store/app.store";
import { loadChildInteraction } from "./load-child-interaction";
import { collaborationStyles as styles } from "./collaboration.styles";

/** Existing child requests can be answered even while its parent is managed. */
export function ChildTaskAttention(props: { child: DelegatedTaskSummary; repositoryPath: string }) {
  const notifications = useAppStore(state => state.notifications);
  const [selected, setSelected] = useState<FleetInteractionControlIdentity | null>(null);
  const [loading, setLoading] = useState(false);
  const loadGeneration = useRef(0);
  useEffect(() => () => { loadGeneration.current += 1; }, []);
  const [error, setError] = useState<string | null>(null);
  const requests = notifications.filter(notification => isActiveDelegatedTaskPhase(props.child.phase) &&
    !notification.resolvedAt && (!notification.expiresAt || Date.parse(notification.expiresAt) > Date.now()) &&
    notification.repositoryPath === props.repositoryPath && notification.workspaceId === props.child.delegatedWorkspaceId &&
    notification.taskId === props.child.delegatedTaskId && notification.turnId && getNotificationInteractionRequestId(notification));
  async function review(expected: FleetInteractionControlIdentity) {
    const generation = ++loadGeneration.current;
    setSelected(expected); setLoading(true); setError(null);
    try { await loadChildInteraction(expected); }
    catch (cause) { if (generation === loadGeneration.current) setError(cause instanceof Error ? cause.message : "This request could not be loaded."); }
    finally { if (generation === loadGeneration.current) setLoading(false); }
  }
  if (!requests.length && !selected) return null;
  return <div {...stylex.props(styles.compactStack)} aria-label={`Requests for ${props.child.delegationKey}`}>
    {requests.map(notification => {
      const expected: FleetInteractionControlIdentity = { repositoryPath: props.repositoryPath, workspaceId: props.child.delegatedWorkspaceId,
        taskId: props.child.delegatedTaskId, turnId: notification.turnId, kind: notification.kind === "task.approval_requested" ? "approval" : "user-input",
        requestId: getNotificationInteractionRequestId(notification)!, messageId: getNotificationInteractionMessageId(notification) };
      return <div key={notification.id} {...stylex.props(styles.compactStack)}>
        <p {...stylex.props(styles.body, styles.muted)}>{notification.body || notification.title}</p>
        <ActionButton size="xs" disabled={loading} aria-expanded={selected?.requestId === expected.requestId} onClick={() => void review(expected)}>
          {expected.kind === "approval" ? "Review approval" : "Answer question"}
        </ActionButton>
      </div>;
    })}
    {loading ? <p role="status" {...stylex.props(styles.body, styles.muted)}>Loading request…</p> : error ? <p role="alert" {...stylex.props(styles.body)}>{error}</p> : null}
    {selected && !loading && !error ? <FleetTaskControlPanel key={`${selected.taskId}:${selected.turnId}:${selected.requestId}:${selected.messageId}`}
      target={{ ...selected, taskTitle: props.child.delegationKey }} expectedInteraction={selected} interactionOnly
      onOpenTask={() => {}} onClose={() => setSelected(null)} /> : null}
    {selected && !loading ? <ActionButton size="xs" weight="quiet" onClick={() => void review(selected)}>Refresh request</ActionButton> : null}
  </div>;
}
