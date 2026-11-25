import { i18n, useTranslation } from "@/i18n";
import { AgentCard } from "@/components/aui/components/AgentSummary";
import { StateMark } from "@/components/aui/components/StateMark";
import { AgentIdentity } from "@/components/delegation/AgentIdentity";
import { fromDelegatedTask } from "@/lib/delegation/exchange";
import { describeAgentIdentity, exchangeStatusToWorkState } from "@/lib/delegation/format";
import { describeDelegatedTaskPhase, type DelegatedTaskBlockedKind } from "@/lib/runs/delegated-task-view";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { DelegatedTaskRowActions, type DelegatedTaskRowActionHandlers } from "@/components/session/DelegatedTaskRows";
import { delegatedTaskRowsStyles as styles } from "@/components/session/delegated-task-rows.styles";
import { Button } from "@/components/ui";
import { sx, cx } from "@/components/aui/utils/stylex";
import { openAgentProgress } from "@/store/agent-progress-panel-store";

const BLOCKED_HINT: Record<DelegatedTaskBlockedKind, string> = {
  get "user-input"() { return i18n.t("session:delegatedTaskRows.userInput"); },
  get approval() { return i18n.t("session:delegatedTaskRows.approval"); },
  get "agent-run"() { return i18n.t("session:delegatedTaskRows.agentRun"); },
};


interface FleetDelegationCardsProps extends DelegatedTaskRowActionHandlers {
  rows: readonly DelegatedTaskSummary[];
  errorByDelegationKey?: Readonly<Record<string, string>>;
  blockedByDelegationKey?: Readonly<Record<string, DelegatedTaskBlockedKind>>;
  busyDelegationKey?: string | null;
  listError?: string | null;
  onRetryList?: () => void;
  className?: string;
  parentWorkspaceId?: string;
  repositoryPath?: string;
}

export function FleetDelegationCards(props: FleetDelegationCardsProps) {
  useTranslation();
  if (!props.rows.length && !props.listError) return null;
  return (
    <section className={cx(sx(styles.sectionRoot), props.className)} aria-label={i18n.t("session:delegatedTaskRows.ariaLabel")}
      data-testid={props.rows.length ? "delegated-task-rows" : undefined}>
      {props.rows.length > 0 ? <h3 className={sx(styles.sectionHeading)}>{i18n.t("session:delegatedTaskRows.delegatedTaskRowsSurface")}</h3> : null}
      {props.listError ? (
        <p className={sx(styles.errorText)} role="alert">
          {i18n.t("session:delegatedTaskRows.listFailed")}
          {props.onRetryList ? <Button size="sm" variant="ghost" onClick={props.onRetryList}>{i18n.t("common:actions.retry")}</Button> : null}
        </p>
      ) : null}
      <div className={sx(styles.sectionList)}>
        {props.rows.map((child) => {
          const key = child.delegationKey;
          const blocked = props.blockedByDelegationKey?.[key];
          const exchange = fromDelegatedTask(child, { blockedKind: blocked });
          const phase = describeDelegatedTaskPhase(child, blocked);
          const requested = child.requestedModel || child.requestedEffort
            ? describeAgentIdentity({ model: child.requestedModel, effort: child.requestedEffort }).text
            : null;
          return (
            <div key={key} data-delegated-task-delegation-key={key} data-delegated-task-blocked={phase.blocked || undefined}>
              <AgentCard
                title={key}
                status={<StateMark state={exchangeStatusToWorkState(exchange.outcome.status)} size="xs" showLabel label={phase.label} />}
                facts={
                  <>
                    <span data-testid="delegated-task-requested-details" title={requested ? i18n.t("session:delegatedTaskRows.title", { value1: requested }) : undefined}>
                      <AgentIdentity compact providerId={child.providerId} model={child.requestedModel} effort={child.requestedEffort} />
                    </span>
                    {child.attempt > 0 ? <span>{i18n.t("session:delegatedTaskRows.sentence43", { value1: child.attempt + 1 })}</span> : null}
                  </>
                }
                activity={phase.blocked && blocked ? BLOCKED_HINT[blocked] : child.reason}
                actions={<Button size="sm" variant="ghost" onClick={() => openAgentProgress({
                  kind: "delegated-task", parentTaskId: child.parentTaskId, parentWorkspaceId: props.parentWorkspaceId,
                  delegationKey: key, delegatedTaskId: child.delegatedTaskId, delegatedWorkspaceId: child.delegatedWorkspaceId,
                  repositoryPath: props.repositoryPath, snapshot: exchange,
                })}>{i18n.t("session:agentProgress.panel.viewProgress")}</Button>}
              />
              {phase.blocked && blocked && child.reason ? <p>{child.reason}</p> : null}
              {props.errorByDelegationKey?.[key] ? <p className={sx(styles.errorText)} role="alert">{props.errorByDelegationKey[key]}</p> : null}
              <DelegatedTaskRowActions child={child} busy={props.busyDelegationKey === key}
                onOpen={props.onOpen} onFollowUp={props.onFollowUp} onRetry={props.onRetry} onStop={props.onStop} onDetach={props.onDetach} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
