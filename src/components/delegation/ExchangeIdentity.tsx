import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { sx } from "@/components/aui/utils/stylex";
import { selectActivityMessages } from "@/components/session/activity-detail.utils";
import { findDelegateRoutedModel, resolveDelegateIdentity, type DelegateIdentity } from "@/lib/delegation/delegate-route";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { AgentIdentity, type AgentIdentityProps } from "./AgentIdentity";
import { delegationStyles as styles } from "./delegation.styles";

const NO_MESSAGES: ChatMessage[] = [];

/**
 * The identity a delegation row leads with. A delegated task's own saved
 * transcript, when the renderer has it loaded, says which model actually ran;
 * until then the row shows the requested one. Row-local: only this row
 * re-renders while the delegated task streams.
 */
export function useExchangeIdentity(exchange: DelegationExchange): DelegateIdentity {
  useTranslation();
  const { delegatedTaskId, delegatedWorkspaceId, delegatedTurnId } = exchange.ref;
  const enabled = exchange.kind === "delegated-task" && Boolean(delegatedTaskId);
  // The store's own array, or the shared empty one: never a fresh container.
  const messages = useAppStore((state) => enabled
    ? selectActivityMessages({ state, parentTaskId: "", delegatedTaskId, delegatedWorkspaceId })
    : NO_MESSAGES);
  const routed = useMemo(() => findDelegateRoutedModel(messages, delegatedTurnId), [messages, delegatedTurnId]);
  // Cheap and language-dependent (the requested text is localized), so it is
  // not memoized: a language switch re-renders the row through useTranslation.
  return resolveDelegateIdentity(exchange.identity, routed);
}

/** Who ran a delegation, and what it asked for when that was something else. */
export function ExchangeIdentity(props: Omit<AgentIdentityProps, "providerId" | "model" | "effort" | "modelEvidence"> & {
  exchange: DelegationExchange;
}) {
  const { exchange, ...rest } = props;
  return <ExchangeIdentityView {...rest} identity={useExchangeIdentity(exchange)} />;
}

export function ExchangeIdentityView(props: Omit<AgentIdentityProps, "providerId" | "model" | "effort" | "modelEvidence"> & {
  identity: DelegateIdentity;
}) {
  useTranslation();
  const { identity, ...rest } = props;
  return (
    <>
      <AgentIdentity
        {...rest}
        providerId={identity.providerId}
        model={identity.model}
        effort={identity.effort}
        modelEvidence={identity.modelEvidence}
      />
      {identity.requested ? (
        <span
          className={sx(styles.identityRouted)}
          title={i18n.t("agentRuns:delegateRoute.title", { requested: identity.requested })}
          data-testid="delegate-requested-model"
        >
          {i18n.t("agentRuns:delegateRoute.requested", { model: identity.requested })}
        </span>
      ) : null}
    </>
  );
}
