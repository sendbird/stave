import { useMemo } from "react";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  SkipForward,
  TriangleAlert,
} from "lucide-react";
import {
  buildAdvisorChecks,
  describeAdvisorDeadline,
  describeAdvisorExchangeStatus,
  describeAdvisorParticipant,
  formatAdvisorDuration,
  resolveAdvisorExchangeTone,
  resolveAdvisorLaneSegments,
} from "@/components/session/advisor-exchange.utils";
import { ExchangeDetail, ExchangeStatusBadge } from "@/components/delegation";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import {
  fromAdvisorSnapshot,
  type DelegationActionId,
} from "@/lib/delegation/exchange";
import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";
import { getProviderWaveTone } from "@/lib/providers/model-catalog";
import { cx, sx } from "@/components/ads/utils/stylex";
import {
  advisorExchangeMonitorStyles as styles,
  advisorExchangeProviderBar,
  advisorExchangeTone,
  advisorExchangeWaveTone,
} from "./advisor-exchange-monitor.styles";
import type { ProviderId } from "@/lib/providers/provider.types";
import { UI_ELEVATION_CLASS } from "@/lib/ui-layers";

/**
 * The standalone advisor exchange card.
 *
 * No longer mounted over the chat: the live exchange renders as a row of the
 * Turn Activity shelf, which already hosts every other delegation this turn
 * made. The card stays exported for the Lens harness and the dev preview,
 * where its baton track is still the clearest picture of "who is holding the
 * turn right now".
 */

function providerBarStyle(providerId: ProviderId | undefined) {
  if (!providerId) {
    return advisorExchangeProviderBar.fallback;
  }
  const tone = getProviderWaveTone({ providerId });
  if (tone === "accent") {
    return advisorExchangeProviderBar.fallback;
  }
  return advisorExchangeProviderBar[tone];
}

function ParticipantChip(props: {
  role: string;
  providerId?: ProviderId;
  model?: string;
  active: boolean;
}) {
  const label = describeAdvisorParticipant({
    providerId: props.providerId,
    model: props.model,
  });
  return (
    <div className={sx(styles.chip)}>
      <span className={sx(styles.chipRole)}>{props.role}</span>
      <span
        className={sx(
          styles.chipName,
          props.providerId
            ? advisorExchangeWaveTone[
                getProviderWaveTone({ providerId: props.providerId })
              ]
            : styles.chipNameMuted,
          props.active && styles.chipNameActive,
        )}
        title={label}
      >
        {label}
      </span>
    </div>
  );
}

export function AdvisorExchangeCard(props: {
  snapshot: AdvisorExchangeSnapshot;
  nowMs: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSkip: () => void;
  onDismiss: () => void;
  canSkip: boolean;
  /** Opens the session consult log focused on this consult. */
  onOpenLog?: () => void;
  consultLogCount?: number;
}) {
  const { snapshot } = props;
  const tone = resolveAdvisorExchangeTone(snapshot);
  const lanes = resolveAdvisorLaneSegments({ snapshot, nowMs: props.nowMs });
  const deadline = describeAdvisorDeadline({ snapshot, nowMs: props.nowMs });
  const failedChecks = useMemo(
    () =>
      buildAdvisorChecks(snapshot).filter((check) => check.status === "fail")
        .length,
    [snapshot],
  );
  const running = snapshot.outcome === "pending";
  const batonAtAdvisor = running;
  const exchange = useMemo(
    () =>
      fromAdvisorSnapshot(snapshot, {
        canCancel: props.canSkip,
        hasConsultLog: Boolean(props.onOpenLog && (props.consultLogCount ?? 0) > 0),
        canDismiss: !props.canSkip,
      }),
    [props.canSkip, props.consultLogCount, props.onOpenLog, snapshot],
  );
  const handleAction = (action: DelegationActionId) => {
    if (action === "cancel") {
      props.onSkip();
    } else if (action === "open-log") {
      props.onOpenLog?.();
    } else if (action === "dismiss") {
      props.onDismiss();
    }
  };

  return (
    <div
      data-testid="advisor-exchange-card"
      data-outcome={snapshot.outcome}
      className={cx(UI_ELEVATION_CLASS.floating, sx(styles.card))}
    >
      <div className={sx(styles.header)}>
        {running ? (
          <Loader
            aria-hidden
            className={sx(styles.headerLoader, advisorExchangeTone[tone])}
            size="xs"
            variant="handoff"
          />
        ) : (
          <ArrowLeftRight
            className={sx(styles.headerIcon, advisorExchangeTone[tone])}
          />
        )}
        <span className={sx(styles.headerTitle)}>{exchange.title}</span>
        {failedChecks > 0 && !running ? (
          <TriangleAlert
            className={sx(styles.headerWarn)}
            aria-label={`${failedChecks} checks failed`}
          />
        ) : null}
        <ExchangeStatusBadge
          status={exchange.outcome.status}
          data-testid="advisor-exchange-outcome"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-expanded={props.expanded}
          aria-label={
            props.expanded
              ? "Collapse advisor exchange"
              : "Expand advisor exchange"
          }
          onClick={props.onToggleExpanded}
        >
          {props.expanded ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      <div className={sx(styles.participantRow)}>
        <ParticipantChip
          role="Primary"
          providerId={snapshot.primaryProviderId}
          model={snapshot.primaryModel}
          active={!batonAtAdvisor && running}
        />
        <div className={sx(styles.batonTrack)}>
          <div className={sx(styles.batonRail)} />
          <span
            data-testid="advisor-exchange-baton"
            className={sx(
              styles.baton,
              providerBarStyle(
                batonAtAdvisor
                  ? snapshot.advisorProviderId
                  : snapshot.primaryProviderId,
              ),
            )}
            style={{ left: batonAtAdvisor ? "calc(100% - 0.375rem)" : "0" }}
          />
        </div>
        <ParticipantChip
          role="Advisor"
          providerId={snapshot.advisorProviderId}
          model={snapshot.advisorModel}
          active={batonAtAdvisor}
        />
      </div>

      {/* Latency split. The blocked span is the advisor's real cost to the turn. */}
      <div className={sx(styles.laneTrack)}>
        <div
          data-testid="advisor-exchange-advisor-lane"
          className={sx(
            styles.lane,
            providerBarStyle(snapshot.advisorProviderId),
          )}
          style={{ width: `${lanes.advisorFraction * 100}%` }}
        />
        <div
          className={sx(styles.laneBlocked)}
          style={{
            width: `${Math.max(0, lanes.blockedFraction - lanes.advisorFraction) * 100}%`,
          }}
        />
      </div>

      <div className={sx(styles.statusRow)}>
        <p className={sx(styles.statusText)}>
          {describeAdvisorExchangeStatus(snapshot)}
        </p>
        <span className={sx(styles.statusElapsed)}>
          {formatAdvisorDuration(lanes.elapsedMs)}
        </span>
      </div>

      {props.canSkip ? (
        <div className={sx(styles.skipRow)}>
          <span
            className={sx(
              styles.skipText,
              deadline.passed && styles.skipTextPassed,
            )}
            data-testid="advisor-exchange-deadline"
          >
            {deadline.hint}
          </span>
          <Button
            variant="ghost"
            size="xs"
            xstyle={styles.skipButton}
            onClick={props.onSkip}
          >
            <SkipForward />
            Cancel consult
          </Button>
        </div>
      ) : null}

      {props.expanded ? (
        <div className={sx(styles.expanded)}>
          <ExchangeDetail
            exchange={exchange}
            nowMs={props.nowMs}
            onAction={handleAction}
            data-testid="advisor-exchange-detail"
          />
        </div>
      ) : null}
    </div>
  );
}
