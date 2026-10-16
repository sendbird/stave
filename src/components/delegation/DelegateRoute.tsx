import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { selectActivityMessages } from "@/components/session/activity-detail.utils";
import { describeDelegateRoute, findDelegateRoutedModel } from "@/lib/delegation/delegate-route";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { delegationStyles as styles } from "./delegation.styles";

const NO_MESSAGES: ChatMessage[] = [];

/**
 * The requested and routed model of a delegated task, from its own saved
 * transcript when the renderer has it loaded. Row-local: only this row
 * re-renders while the delegated task streams.
 */
export function useDelegateRoute(exchange: DelegationExchange) {
  const { delegatedTaskId, delegatedWorkspaceId, delegatedTurnId } = exchange.ref;
  const enabled = exchange.kind === "delegated-task" && Boolean(delegatedTaskId);
  // The store's own array, or the shared empty one: never a fresh container.
  const messages = useAppStore((state) => enabled
    ? selectActivityMessages({ state, parentTaskId: "", delegatedTaskId, delegatedWorkspaceId })
    : NO_MESSAGES);
  const routed = useMemo(() => findDelegateRoutedModel(messages, delegatedTurnId), [messages, delegatedTurnId]);
  const { providerId, model, effort } = exchange.identity;
  return useMemo(
    () => describeDelegateRoute({ providerId, model, effort }, routed),
    [providerId, model, effort, routed?.providerId, routed?.model, routed?.effort, i18n.language],
  );
}

/** `→ ran Claude Sonnet 5 · High`, drawn only when it differs from the request. */
export function DelegateRoute(props: { exchange: DelegationExchange }) {
  return <DelegateRouteView route={useDelegateRoute(props.exchange)} />;
}

export function DelegateRouteView(props: { route: ReturnType<typeof describeDelegateRoute> }) {
  useTranslation();
  const { route } = props;
  if (!route) return null;
  return (
    <span
      className={sx(styles.identityRouted)}
      title={i18n.t("agentRuns:delegateRoute.title", { requested: route.requested, routed: route.routed })}
      data-testid="delegate-routed-model"
    >
      {i18n.t("agentRuns:delegateRoute.routed", { model: route.routed })}
    </span>
  );
}
